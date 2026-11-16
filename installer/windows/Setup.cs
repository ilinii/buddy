using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;

namespace BuddySetup {
 public sealed partial class Setup {
  Window window; Button primary,close,motionButton; TextBlock heading,description,status; ProgressBar progress; FractalGlass glass;
  DispatcherTimer motionTimer; bool motionPaused,forceReduced; double motionTime; long previousTick;
  bool busy,complete,preview; string installedExe;
  readonly Random random=new Random(7);
  static Stream Resource(string name) { var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(name);if(stream==null)throw new InvalidOperationException("The setup package is incomplete.");return stream; }
  static string HashFile(string path) { using(var sha=SHA256.Create())using(var file=File.OpenRead(path))return BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant(); }
  static string VerifyLocation(string location){
   if(String.IsNullOrWhiteSpace(location))return null;
   try{
    location=location.Trim().Trim('"');
    if(!Path.IsPathRooted(location)||location.StartsWith(@"\\",StringComparison.Ordinal))return null;
    string executable=Path.Combine(location,"buddy.exe");
    return File.Exists(executable)&&HashFile(executable)==Build.AppHash?executable:null;
   }catch(IOException){return null;}catch(UnauthorizedAccessException){return null;}catch(ArgumentException){return null;}catch(System.Security.SecurityException){return null;}
  }
  static string FindVerifiedInstallation(){
   foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32}){
    try{using(var hive=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))using(var key=hive.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Buddy")){
     string executable=VerifyLocation(key==null?null:key.GetValue("InstallLocation") as string);if(executable!=null)return executable;
    }}catch(System.Security.SecurityException){}catch(UnauthorizedAccessException){}catch(IOException){}
   }
   return VerifyLocation(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Buddy"));
  }
  public static string Extract(string directory,Action<double> onProgress) {
   string path=Path.Combine(directory,"Buddy-install-payload.exe");
   using(var source=Resource("Buddy.SetupPayload"))using(var target=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    byte[] buffer=new byte[1024*1024];long copied=0;int count;
    while((count=source.Read(buffer,0,buffer.Length))>0){target.Write(buffer,0,count);copied+=count;onProgress(100.0*copied/source.Length);}
   }
   if(HashFile(path)!=Build.PayloadHash){File.Delete(path);throw new InvalidDataException("The installation files failed verification. Download a fresh copy of Buddy setup.");}
   return path;
  }
  static string TemporaryDirectory(){string path=Path.Combine(Path.GetTempPath(),"Buddy-setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(path);return path;}
  static void Cleanup(string directory){
   string root=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
   if(directory==null||!Path.GetFullPath(directory).StartsWith(root,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(directory).StartsWith("Buddy-setup-",StringComparison.Ordinal))return;
   // Only remove the exact payload file and our now-empty private directory.
   try{string payload=Path.Combine(directory,"Buddy-install-payload.exe");if(File.Exists(payload))File.Delete(payload);Directory.Delete(directory,false);}catch(IOException){}catch(UnauthorizedAccessException){}
  }
  Setup(bool isPreview){
   preview=isPreview;using(var xaml=Resource("Buddy.SetupUI"))window=(Window)XamlReader.Load(xaml);
   using(var mark=Resource("Buddy.KeepsakeMark")){var bitmap=new BitmapImage();bitmap.BeginInit();bitmap.CacheOption=BitmapCacheOption.OnLoad;bitmap.StreamSource=mark;bitmap.EndInit();bitmap.Freeze();((Image)window.FindName("BrandMark")).Source=bitmap;}
   primary=(Button)window.FindName("Primary");close=(Button)window.FindName("CloseButton");motionButton=(Button)window.FindName("MotionButton");heading=(TextBlock)window.FindName("Heading");description=(TextBlock)window.FindName("Description");status=(TextBlock)window.FindName("Status");progress=(ProgressBar)window.FindName("Progress");
   glass=new FractalGlass();((Border)window.FindName("GlassHost")).Child=glass;
   close.Click+=(s,e)=>window.Close();window.Closing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="Installation is in progress. Keep this window open.";}};
   ((Grid)window.FindName("Caption")).MouseLeftButtonDown+=(s,e)=>{if(e.ButtonState==MouseButtonState.Pressed&&!IsButtonSource(e.OriginalSource))try{window.DragMove();}catch(InvalidOperationException){}};
   primary.Click+=async(s,e)=>{if(preview){status.Text="Preview only — no files will be installed.";return;}if(complete){OpenBuddy();return;}await Install();};
   window.KeyDown+=(s,e)=>{if(e.Key==Key.Escape&&!busy)window.Close();};
   AddMotion();
   if(preview){window.Title="Buddy setup preview";((TextBlock)window.FindName("Eyebrow")).Text="SETUP PREVIEW";}
   else window.Loaded+=async(s,e)=>await RecognizeInstalled();
  }
  static bool IsButtonSource(object source){
   var node=source as DependencyObject;
   while(node!=null){if(node is Button)return true;node=node is Visual?VisualTreeHelper.GetParent(node):LogicalTreeHelper.GetParent(node);}return false;
  }
  bool MotionAllowed { get{return !motionPaused&&!forceReduced&&SystemParameters.ClientAreaAnimation;} }
  void SyncMotion(){
   bool reduced=forceReduced||!SystemParameters.ClientAreaAnimation;
   motionButton.Content=reduced?"Motion reduced":motionPaused?"Resume motion":"Pause motion";
   motionButton.IsEnabled=!reduced;
   System.Windows.Automation.AutomationProperties.SetName(motionButton,reduced?"Installer animation reduced":motionPaused?"Resume installer animation":"Pause installer animation");
   if(MotionAllowed&&window.IsVisible&&window.IsActive&&window.WindowState!=WindowState.Minimized){previousTick=Stopwatch.GetTimestamp();motionTimer.Start();}else motionTimer.Stop();
  }
  void AddMotion(){
   var canvas=(Canvas)window.FindName("Glyphs");
   for(int i=0;i<76;i++){var glyph=new TextBlock{Text="0123456789abcdef"[random.Next(16)].ToString(),FontSize=10,Foreground=new SolidColorBrush(Color.FromRgb(90,96,88))};Canvas.SetLeft(glyph,18+random.Next(690));Canvas.SetTop(glyph,random.Next(490));canvas.Children.Add(glyph);}
   motionTimer=new DispatcherTimer(DispatcherPriority.Background){Interval=TimeSpan.FromMilliseconds(50)};
   motionTimer.Tick+=(s,e)=>{
    if(!MotionAllowed||!window.IsVisible||!window.IsActive||window.WindowState==WindowState.Minimized){SyncMotion();return;}
    long now=Stopwatch.GetTimestamp();double delta=Math.Min(.1,(now-previousTick)/(double)Stopwatch.Frequency);previousTick=now;motionTime+=delta;
    glass.RenderFrame(motionTime);foreach(TextBlock glyph in canvas.Children){double y=Canvas.GetTop(glyph)+delta*4.375;Canvas.SetTop(glyph,y>490?-12:y);}
   };
   motionButton.Click+=(s,e)=>{motionPaused=!motionPaused;SyncMotion();};
   window.Activated+=(s,e)=>SyncMotion();window.Deactivated+=(s,e)=>SyncMotion();window.StateChanged+=(s,e)=>SyncMotion();window.IsVisibleChanged+=(s,e)=>SyncMotion();
   PropertyChangedEventHandler preferences=(s,e)=>{if(String.IsNullOrEmpty(e.PropertyName)||e.PropertyName=="ClientAreaAnimation")window.Dispatcher.Invoke(new Action(SyncMotion));};
   SystemParameters.StaticPropertyChanged+=preferences;
   window.Closed+=(s,e)=>{motionTimer.Stop();SystemParameters.StaticPropertyChanged-=preferences;};SyncMotion();
  }
  void Update(string title,string copy,string phase){heading.Text=title;description.Text=copy;status.Text=phase;}
  void ShowComplete(string phase){
   complete=true;progress.IsIndeterminate=false;progress.Visibility=Visibility.Hidden;primary.Content="Open Buddy   →";
   Update("You're all set.","Your next conversation has a place.\nOpen Buddy when you're ready.",phase);
  }
  async Task RecognizeInstalled(){
   busy=true;primary.IsEnabled=false;close.IsEnabled=false;status.Text="Checking for Buddy…";
   try{installedExe=await Task.Run(()=>FindVerifiedInstallation());if(installedExe!=null)ShowComplete("Buddy is already installed and verified.");else status.Text="";}
   finally{busy=false;primary.IsEnabled=true;close.IsEnabled=true;}
  }
  async Task Install(){
   if(Process.GetProcessesByName("buddy").Length>0){Update("Buddy is still open.","Finish your recording and close Buddy,\nthen come back to install.","Your current workspace has not been changed.");primary.Content="Check again   →";return;}
   busy=true;primary.IsEnabled=false;close.IsEnabled=false;progress.Visibility=Visibility.Visible;progress.IsIndeterminate=false;
   string temporary=null;
   try{
    Update("Making room\nfor Buddy.","Preparing the app and its included speech model.","Preparing installation files…");
    temporary=TemporaryDirectory();var updates=new Progress<double>(value=>{progress.Value=value;status.Text="Preparing installation files · "+((int)value)+"%";});
    string payload=await Task.Run(()=>Extract(temporary,value=>((IProgress<double>)updates).Report(value)));
    progress.IsIndeterminate=true;status.Text="Installing Buddy and any required Windows components…";
    int exit=await Task.Run(()=>{using(var process=new Process()){process.StartInfo=new ProcessStartInfo(payload,"/S"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};process.Start();process.WaitForExit();return process.ExitCode;}});
    if(exit!=0&&exit!=3010)throw new InvalidOperationException("Windows could not finish installing Buddy (code "+exit+"). Close Buddy and retry. No workspace reset was requested.");
    installedExe=await Task.Run(()=>FindVerifiedInstallation());
    if(installedExe==null)throw new InvalidOperationException("Windows finished setup, but the installed app did not pass verification. Download a fresh copy of Buddy setup and retry.");
    ShowComplete(exit==3010?"Installed. Windows recommends a restart.":"Buddy is installed and verified.");
   }catch(Exception error){progress.IsIndeterminate=false;progress.Value=0;Update("Setup needs attention.",error is IOException?"Windows could not access the installation files.\nCheck free disk space and file permissions, then retry.":error.Message,"Your workspace has not been reset.");primary.Content="Try again   →";}
   finally{Cleanup(temporary);busy=false;primary.IsEnabled=true;close.IsEnabled=true;}
  }
  void OpenBuddy(){try{if(HashFile(installedExe)!=Build.AppHash)throw new InvalidDataException();Process.Start(new ProcessStartInfo(installedExe){UseShellExecute=true});window.Close();}catch{status.Text="Could not open Buddy. Launch it from your Start menu.";}}
  void Render(string file,string state){
   if(state=="installing"){Update("Making room\nfor Buddy.","Preparing the app and its included speech model.","Preparing installation files · 42% (preview)");progress.Visibility=Visibility.Visible;progress.Value=42;primary.IsEnabled=false;close.IsEnabled=false;}
   if(state=="complete"){Update("You're all set.","Your next conversation has a place.\nOpen Buddy when you're ready.","Installation preview — no files were installed.");primary.Content="Open Buddy   →";}
   window.Show();window.UpdateLayout();var bitmap=new RenderTargetBitmap((int)window.ActualWidth,(int)window.ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(window);var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(bitmap));using(var output=File.Create(file))png.Save(output);window.Close();
  }
  [STAThread] public static int Main(string[] args){
   if(args.Length==2&&args[0]=="--check-installation"){string executable=FindVerifiedInstallation();bool verified=executable!=null;File.WriteAllText(args[1],"{\"installedAppVerified\":"+(verified?"true":"false")+",\"expectedAppSHA256\":\""+Build.AppHash+"\",\"installed\":false}");return verified?0:2;}
   if(args.Length==2&&args[0]=="--verify-payload"){string directory=null;try{directory=TemporaryDirectory();string payload=Extract(directory,_=>{});File.WriteAllText(args[1],"{\"payloadHashVerified\":true,\"bytes\":"+new FileInfo(payload).Length+",\"installed\":false}");return 0;}catch{return 1;}finally{Cleanup(directory);}}
   var app=new Application{ShutdownMode=ShutdownMode.OnMainWindowClose};bool preview=args.Length>0&&(args[0]=="--preview"||args[0]=="--render-preview"||args[0]=="--render-motion"||args[0]=="--verify-motion");var setup=new Setup(preview);app.MainWindow=setup.window;
   if(args.Length>=2&&args[0]=="--render-preview"){setup.Render(args[1],args.Length>2?args[2]:"ready");return 0;}
   if(args.Length==2&&args[0]=="--render-motion"){setup.RenderMotion(args[1]);return 0;}
   if(args.Length==2&&args[0]=="--verify-motion")setup.window.Loaded+=async(s,e)=>{try{bool passed=await setup.VerifyMotion(args[1]);app.Shutdown(passed?0:1);}catch(Exception error){File.WriteAllText(args[1],"{\"verified\":false,\"errorType\":\""+error.GetType().Name+"\",\"installed\":false}");app.Shutdown(1);}};
   return app.Run(setup.window);
  }
 }
}
