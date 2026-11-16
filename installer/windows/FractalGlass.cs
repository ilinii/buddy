using System;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace BuddySetup {
 // Original native material inspired by fluted/refracted glass. No WebView,
 // external images, shader compiler or additional runtime is needed by setup.
 public sealed class FractalGlass : FrameworkElement {
  const int WidthPixels=256,HeightPixels=288;
  readonly WriteableBitmap bitmap=new WriteableBitmap(WidthPixels,HeightPixels,96,96,PixelFormats.Bgra32,null);
  readonly byte[] pixels=new byte[WidthPixels*HeightPixels*4];
  readonly double[] refractedX=new double[WidthPixels*HeightPixels],refractedY=new double[WidthPixels*HeightPixels],relief=new double[WidthPixels*HeightPixels];
  public int Frames { get; private set; }
  public double TotalRenderMilliseconds { get; private set; }
  public FractalGlass(){
   IsHitTestVisible=false;RenderOptions.SetBitmapScalingMode(this,BitmapScalingMode.HighQuality);
   for(int y=0;y<HeightPixels;y++)for(int x=0;x<WidthPixels;x++){
    int p=y*WidthPixels+x;double u=(x+.5)/WidthPixels,v=(y+.5)/HeightPixels;
    double noise=Fractal(u*3.2,v*3.2),stripe=u*17+noise*.55;
    double wave=Math.Sin(stripe*Math.PI*2),edge=Math.Pow(.5+.5*Math.Cos(stripe*Math.PI*2),16);
    refractedX[p]=u+wave*.025+noise*.06;
    refractedY[p]=v+Fractal(u*4.1+9,v*4.1+4)*.028;
    relief[p]=edge*.16-wave*.025+(Noise(x,y)-.5)*.004;
   }
   RenderFrame(0);
  }
  static double Noise(int x,int y){unchecked{uint h=(uint)(x*374761393+y*668265263+7);h=(h^(h>>13))*1274126177;return (h^(h>>16))/(double)uint.MaxValue;}}
  static double SmoothNoise(double x,double y){
   int ix=(int)Math.Floor(x),iy=(int)Math.Floor(y);double fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
   double a=Noise(ix,iy),b=Noise(ix+1,iy),c=Noise(ix,iy+1),d=Noise(ix+1,iy+1);
   return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  }
  static double Fractal(double x,double y){double value=0,weight=.57;for(int i=0;i<4;i++){value+=(SmoothNoise(x,y)-.5)*weight;x=x*2.03+13;y=y*2.03+7;weight*=.5;}return value;}
  public void RenderFrame(double seconds){
   var watch=Stopwatch.StartNew();double angle=seconds*Math.PI/2,a=Math.Sin(angle),b=Math.Cos(angle);
   for(int p=0;p<refractedX.Length;p++){
    double u=refractedX[p],v=refractedY[p];
    double bend=.14*Math.Sin(v*6.2+angle),ribbon=(u-.47-.17*a-bend-(v-.5)*.25)*7;
    double fold=(u-.68+.13*b+bend*.6)*17,shine=(u-.26-.12*b-v*.12)*27;
    double light=.93-.76/(1+ribbon*ribbon)-.13/(1+fold*fold)+.18/(1+shine*shine)+relief[p]-.025*v;
    byte tone=(byte)Math.Max(22,Math.Min(252,(int)(light*255)));int i=p*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=tone;pixels[i+3]=255;
   }
   bitmap.WritePixels(new Int32Rect(0,0,WidthPixels,HeightPixels),pixels,WidthPixels*4,0);
   Frames++;TotalRenderMilliseconds+=watch.Elapsed.TotalMilliseconds;InvalidateVisual();
  }
  public string Fingerprint(){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(pixels)).Replace("-","");}
  protected override void OnRender(DrawingContext drawing){
   base.OnRender(drawing);if(ActualWidth<=0||ActualHeight<=0)return;
   var rect=new Rect(0,0,ActualWidth,ActualHeight);drawing.PushClip(new RectangleGeometry(rect,22,22));drawing.DrawImage(bitmap,rect);drawing.Pop();
   drawing.DrawRoundedRectangle(null,new Pen(new SolidColorBrush(Color.FromArgb(165,255,255,255)),1),new Rect(.5,.5,Math.Max(0,ActualWidth-1),Math.Max(0,ActualHeight-1)),22,22);
  }
 }
}
