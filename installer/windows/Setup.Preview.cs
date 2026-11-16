using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace BuddySetup {
 public sealed partial class Setup {
  RenderTargetBitmap Snapshot(double scale){
   window.UpdateLayout();var bitmap=new RenderTargetBitmap((int)(window.ActualWidth*scale),(int)(window.ActualHeight*scale),96*scale,96*scale,PixelFormats.Pbgra32);bitmap.Render(window);return bitmap;
  }
  static int SkipGifBlocks(byte[] bytes,int cursor){
   while(cursor<bytes.Length&&bytes[cursor]!=0){cursor+=1+bytes[cursor];}
   if(cursor>=bytes.Length)throw new InvalidDataException("Incomplete GIF blocks.");return cursor+1;
  }
  static void SetGifTiming(byte[] bytes,int cursor){
   // WPF's encoder emits zero delays on this runtime despite frame metadata.
   // Walk GIF blocks (never scan compressed bytes) and set explicit 100ms frames.
   int controls=0,frames=0;
   while(cursor<bytes.Length&&bytes[cursor]!=59){
    if(bytes[cursor]==33){
     if(cursor+7<bytes.Length&&bytes[cursor+1]==249&&bytes[cursor+2]==4){bytes[cursor+4]=10;bytes[cursor+5]=0;controls++;}
     cursor=SkipGifBlocks(bytes,cursor+2);
    }else if(bytes[cursor]==44&&cursor+10<bytes.Length){
     int packed=bytes[cursor+9];cursor+=10+((packed&128)!=0?3*(1<<((packed&7)+1)):0);cursor=SkipGifBlocks(bytes,cursor+1);frames++;
    }else throw new InvalidDataException("Unexpected GIF block.");
   }
   if(frames!=40||controls!=40)throw new InvalidDataException("Incomplete motion preview.");
  }
  void RenderMotion(string file){
   window.Show();window.UpdateLayout();motionTimer.Stop();
   var gif=new GifBitmapEncoder();
   for(int i=0;i<40;i++){
    glass.RenderFrame(i*.1);var metadata=new BitmapMetadata("gif");metadata.SetQuery("/grctlext/Delay",(ushort)10);metadata.SetQuery("/grctlext/Disposal",(byte)2);
    gif.Frames.Add(BitmapFrame.Create(Snapshot(.8),null,metadata,null));
   }
   using(var encoded=new MemoryStream()){
    gif.Save(encoded);byte[] bytes=encoded.ToArray();
    if(bytes.Length<13||bytes[0]!=71||bytes[1]!=73||bytes[2]!=70)throw new InvalidDataException("Preview GIF encoding failed.");
    int offset=13+((bytes[10]&128)!=0?3*(1<<((bytes[10]&7)+1)):0);
    SetGifTiming(bytes,offset);
    // Standard NETSCAPE2.0 application extension: loop the preview indefinitely.
    byte[] loop={33,255,11,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0};
    using(var output=File.Create(file)){output.Write(bytes,0,offset);output.Write(loop,0,loop.Length);output.Write(bytes,offset,bytes.Length-offset);}
   }
   window.Close();
  }
  static string Boolean(bool value){return value?"true":"false";}
  async Task<bool> VerifyMotion(string report){
   window.Activate();await Task.Delay(150);bool osMotion=SystemParameters.ClientAreaAnimation;
   int baseline=glass.Frames;string before=glass.Fingerprint();await Task.Delay(350);
   bool moving=glass.Frames>=baseline+2&&before!=glass.Fingerprint();
   bool buttonHitTest=IsButtonSource(VisualTreeHelper.GetChildrenCount(motionButton)>0?VisualTreeHelper.GetChild(motionButton,0):motionButton);
   motionButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));string paused=glass.Fingerprint();int pausedFrames=glass.Frames;await Task.Delay(220);
   bool pauseVerified=paused==glass.Fingerprint()&&pausedFrames==glass.Frames;
   motionPaused=false;forceReduced=true;SyncMotion();string reduced=glass.Fingerprint();await Task.Delay(220);
   bool reducedVerified=reduced==glass.Fingerprint()&&!motionTimer.IsEnabled&&!motionButton.IsEnabled;
   forceReduced=false;window.WindowState=WindowState.Minimized;SyncMotion();string minimized=glass.Fingerprint();await Task.Delay(150);
   bool minimizedVerified=minimized==glass.Fingerprint()&&!motionTimer.IsEnabled;
   window.WindowState=WindowState.Normal;window.Activate();SyncMotion();string resume=glass.Fingerprint();await Task.Delay(250);
   bool resumeVerified=!osMotion||resume!=glass.Fingerprint();
   bool verified=(!osMotion||moving)&&pauseVerified&&reducedVerified&&minimizedVerified&&resumeVerified&&buttonHitTest;
   File.WriteAllText(report,"{\"verified\":"+Boolean(verified)+",\"osMotionEnabled\":"+Boolean(osMotion)+",\"activeMotionVerified\":"+Boolean(moving)+",\"pauseVerified\":"+Boolean(pauseVerified)+",\"simulatedReducedMotionVerified\":"+Boolean(reducedVerified)+",\"minimizedVerified\":"+Boolean(minimizedVerified)+",\"resumeVerified\":"+Boolean(resumeVerified)+",\"captionButtonHitTestVerified\":"+Boolean(buttonHitTest)+",\"renderedFrames\":"+glass.Frames+",\"meanRenderMs\":"+(glass.TotalRenderMilliseconds/glass.Frames).ToString("F3",CultureInfo.InvariantCulture)+",\"installed\":false}");
   return verified;
  }
 }
}
