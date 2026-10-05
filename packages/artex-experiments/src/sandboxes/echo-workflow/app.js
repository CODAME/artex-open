(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const FPS = 24, W = 320, H = 200, ECHO_CAP = 145, P5_CAP = 241;
  const state = {count:4, blend:68, depth:24, offset:0, enabled:[true,true,true,true], paused:false, extended:false, p5Taps:12, p5Span:144, input:'demo', frame:0, time:0};
  const source = document.createElement('canvas'); source.width=W; source.height=H;
  const ctx = source.getContext('2d', {alpha:false});
  const echoRing = [], p5Ring = [];
  let echoHead=0, echoStored=0, p5Head=0, p5Stored=0, p=null, p5Instance=null, stream=null, cameraPending=false, cameraRequest=0;
  let pointer={x:.5,y:.5,active:false}, prevTime=0, accumulator=0, visualDirty=true, codeMode='shader';
  const taps=[...document.querySelectorAll('.tap')], thumbContexts=taps.map(t=>t.querySelector('canvas').getContext('2d'));
  const echoCanvas=$('echo');
  let gpu=null, gpuDevice=null, disposed=false, animationFrame=0;
  let shaderText='', p5Text='';
  const errorLog=[];

  function notice(message) { $('notice').textContent=message; $('notice').hidden=!message; }
  function delayFor(i, count=state.count, depth=state.depth) { return state.offset + Math.round((i+1)*depth/count); }
  function getFrame(ring,head,stored,capacity,delay) { if(!stored)return source; const age=Math.min(delay,stored-1); const item=ring[(head-1-age+capacity)%capacity]; return item.canvas || item; }
  function newCanvas() { const c=document.createElement('canvas'); c.width=W; c.height=H; return c; }

  async function initGPU() {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    const device = await adapter.requestDevice();
    gpuDevice=device;
    if (disposed) { device.destroy(); return; }
    const context = echoCanvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device, format, alphaMode:'opaque'});
    const shader = device.createShaderModule({code:window.__echoAssets.wgsl});
    const pipeline = await device.createRenderPipelineAsync({
      layout:'auto', vertex:{module:shader,entryPoint:'vertexMain'},
      fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format}]},
      primitive:{topology:'triangle-list'},
    });
    if (disposed) { device.destroy(); return; }
    const sampler = device.createSampler({minFilter:'linear',magFilter:'linear'});
    const uniform = device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const images = Array.from({length:5},()=>device.createTexture({
      size:[W,H], format:'rgba8unorm',
      usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,
    }));
    const bindGroup = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:sampler}, ...images.map((image,i)=>({binding:i+1,resource:image.createView()})),
      {binding:6,resource:{buffer:uniform}},
    ]});
    gpu={device,context,pipeline,uniform,images,bindGroup};
    device.lost.then(()=>{if(!disposed){gpu=null;notice('Graphics interrupted. Reload Echo Lab to restart.');}});
  }

  function drawSource() {
    ctx.fillStyle='#070a0c';ctx.fillRect(0,0,W,H);
    if(state.input==='camera' && $('video').readyState>=2) {
      const v=$('video'), scale=Math.max(W/v.videoWidth,H/v.videoHeight), vw=v.videoWidth*scale,vh=v.videoHeight*scale;
      ctx.save();ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(v,(W-vw)/2,(H-vh)/2,vw,vh);ctx.restore();return;
    }
    const t=state.time;
    ctx.strokeStyle='#18261f';ctx.lineWidth=.5;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate(-.28);
    ctx.strokeStyle='#314331';ctx.lineWidth=.6;
    [42,72,106].forEach(r=>{ctx.beginPath();ctx.ellipse(0,0,r,r*.62,0,0,Math.PI*2);ctx.stroke();});
    ctx.restore();
    let x=W/2+Math.sin(t*1.28)*W*.28, y=H/2+Math.cos(t*.97)*H*.23;
    if(pointer.active){x=x*.45+pointer.x*W*.55;y=y*.45+pointer.y*H*.55;}
    const x2=W/2+Math.cos(t*1.71)*W*.26,y2=H/2+Math.sin(t*1.34)*H*.26;
    const g=ctx.createRadialGradient(x,y,3,x,y,55);g.addColorStop(0,'#cdff7b20');g.addColorStop(1,'#cdff7b00');ctx.fillStyle=g;ctx.fillRect(x-55,y-55,110,110);
    ctx.strokeStyle='#cdfd7a';ctx.lineWidth=2.6;ctx.beginPath();ctx.arc(x,y,29,0,Math.PI*2);ctx.stroke();
    ctx.lineWidth=.6;ctx.strokeStyle='#cdfd7a8a';ctx.beginPath();ctx.arc(x,y,36,.4+t*.4,3.1+t*.4);ctx.stroke();
    ctx.strokeStyle='#7dc49b';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.fillStyle='#f49abb';ctx.beginPath();ctx.arc(x2,y2,13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffcd7a';const x3=W/2+Math.sin(t*2.1+.8)*W*.38,y3=H/2+Math.cos(t*1.6)*H*.36;ctx.beginPath();ctx.arc(x3,y3,3.3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#759b81';ctx.font='6px monospace';ctx.fillText('PRESENCE → MEMORY',10,14);ctx.fillText(String(state.frame).padStart(6,'0'),W-36,14);
  }

  function capture() {
    if(!echoRing[echoHead])echoRing[echoHead]=newCanvas();
    echoRing[echoHead].getContext('2d',{alpha:false}).drawImage(source,0,0);echoHead=(echoHead+1)%ECHO_CAP;echoStored=Math.min(echoStored+1,ECHO_CAP);
    if(p) {
      if(!p5Ring[p5Head]){p5Ring[p5Head]=p.createGraphics(W,H);p5Ring[p5Head].pixelDensity(1);}
      p5Ring[p5Head].drawingContext.drawImage(source,0,0);p5Head=(p5Head+1)%P5_CAP;p5Stored=Math.min(p5Stored+1,P5_CAP);
    }
  }

  function canvasMix(context, frames) {
    const c=context.canvas; context.globalCompositeOperation='source-over';context.globalAlpha=1;context.fillStyle='#000';context.fillRect(0,0,c.width,c.height);
    context.globalCompositeOperation='lighter';context.globalAlpha=frames.length ? 1-state.blend/100 : 1;context.drawImage(source,0,0,c.width,c.height);
    for(const frame of frames){context.globalAlpha=state.blend/100/frames.length;context.drawImage(frame,0,0,c.width,c.height);}
    context.globalAlpha=1;context.globalCompositeOperation='source-over';
  }

  function render() {
    const past=Array.from({length:4},(_,i)=>getFrame(echoRing,echoHead,echoStored,ECHO_CAP,delayFor(i)));
    const active=state.enabled.map((e,i)=>e&&i<state.count ? 1 : 0);
    if(gpu) {
      const {device,context,pipeline,uniform,images,bindGroup}=gpu;
      [source,...past].forEach((frame,i)=>device.queue.copyExternalImageToTexture(
        {source:frame}, {texture:images[i]}, [W,H]));
      device.queue.writeBuffer(uniform,0,new Float32Array([...active,state.blend/100,0,0,0]));
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0.03,g:0.04,b:0.03,a:1},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
      device.queue.submit([encoder.finish()]);
    }
    if(p) {
      const n=state.extended?state.p5Taps:state.count, span=state.extended?state.p5Span:state.depth;
      const p5Frames=Array.from({length:n},(_,i)=>({i,frame:getFrame(p5Ring,p5Head,p5Stored,P5_CAP,delayFor(i,n,span))})).filter(({i})=>state.extended||state.enabled[i]).map(({frame})=>frame);
      canvasMix(p.drawingContext,p5Frames);
    }
    thumbContexts.forEach((context,i)=>{context.drawImage(past[i],0,0,160,100);});
    $('buffer-status').textContent=echoStored+' / '+ECHO_CAP+' frames';
    const target=state.offset+state.depth;
    $('echo-state').textContent=!echoStored?'History cleared':echoStored<=target?'Warming up '+Math.min(100,Math.round(echoStored/(target+1)*100))+'%':Math.round(echoStored*W*H*4/1048576)+' MB est.';
    if(p)$('p5-state').textContent=(state.extended?'Extended · ':'Matched · ')+p5Stored+' frames';
    visualDirty=false;
  }

  const numericBounds = {count:[1,4],blend:[0,100],depth:[4,96],offset:[0,48],p5Taps:[1,12],p5Span:[12,192]};
  let boundaries=Object.fromEntries(Object.entries(numericBounds).map(([key,[min,max]])=>[key,{min,max,step:1}]));
  function recipe() {
    return {parameters:Object.fromEntries(['count','blend','depth','offset','enabled','extended','p5Taps','p5Span'].map(key=>[key,state[key]])),mutationTransitionPolicy:'snap',interpretationBoundaries:boundaries,gestureBindings:{}};
  }
  function updateRecipe() {
    if(document.activeElement!==$('recipe-json'))$('recipe-json').value=JSON.stringify(recipe(),null,2);
  }
  $('apply-recipe').addEventListener('click',()=>{
    try {
      const proposed=JSON.parse($('recipe-json').value);
      const parameters=proposed.parameters;
      if(Object.keys(proposed).sort().join()!==Object.keys(recipe()).sort().join() || proposed.mutationTransitionPolicy!=='snap' || !proposed.gestureBindings || Object.keys(proposed.gestureBindings).length || !parameters || Object.keys(parameters).sort().join()!==Object.keys(recipe().parameters).sort().join())throw new Error();
      for(const [key,[min,max]] of Object.entries(numericBounds)) {
        const range=proposed.interpretationBoundaries?.[key];
        if(!Number.isInteger(parameters[key]) || parameters[key]<min || parameters[key]>max || !range || !Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min<min || range.max>max || range.min>range.max || range.step!==1 || Object.keys(range).sort().join()!=='max,min,step')throw new Error();
      }
      if(Object.keys(proposed.interpretationBoundaries).sort().join()!==Object.keys(boundaries).sort().join() || !Array.isArray(parameters.enabled) || parameters.enabled.length!==4 || parameters.enabled.some(value=>typeof value!=='boolean') || typeof parameters.extended!=='boolean')throw new Error();
      Object.assign(state,parameters);boundaries=proposed.interpretationBoundaries;updateUI(true);
      const advanced=Object.entries(boundaries).some(([key,range])=>state[key]<range.min || state[key]>range.max);
      $('recipe-status').textContent=advanced?'Applied advanced values outside your guided ranges. Changes stay in this session.':'Settings applied. Changes stay in this session.';
      updateRecipe();
    } catch { $('recipe-status').textContent='Check the JSON, supported fields and safe control ranges. Settings were not changed.'; }
  });
  function updateUI(markCustom=false) {
    for(const [key,range] of Object.entries(boundaries)) {
      const id=key==='p5Taps'?'p5-taps':key==='p5Span'?'p5-span':key;
      $(id).min=range.min;$(id).max=range.max;$(id).step=range.step;$(id).value=state[key];
    }
    for(const id of ['count','blend','depth','offset'])$(id).value=state[id];
    $('count-value').textContent=state.count+(state.count===1?' tap':' taps');$('blend-value').textContent=state.blend+'%';
    $('depth-value').textContent=state.depth+'f · '+(state.depth/FPS).toFixed(2)+'s';$('offset-value').textContent=state.offset+'f · '+(state.offset/FPS).toFixed(2)+'s';
    $('pause').textContent=state.paused?'▶ Play':'Ⅱ Pause';$('pause').setAttribute('aria-pressed',String(state.paused));
    $('play-status').innerHTML='<i></i> '+(state.paused?'PAUSED':'LIVE')+' <span>'+(state.paused?'History frozen · controls stay live':'24 captures per second')+'</span>';
    const active=state.enabled.filter((e,i)=>e&&i<state.count).length;$('echo-delay').textContent=active+' TEMPORAL '+(active===1?'TAP':'TAPS');
    $('p5-delay').textContent=(state.extended?state.p5Taps:active)+' TEMPORAL '+((state.extended?state.p5Taps:active)===1?'TAP':'TAPS');
    taps.forEach((tap,i)=>{tap.disabled=i>=state.count;tap.classList.toggle('unavailable',i>=state.count);tap.classList.toggle('active',state.enabled[i]&&i<state.count);tap.setAttribute('aria-pressed',String(state.enabled[i]&&i<state.count));tap.querySelector('.tap-age').textContent=i<state.count?'−'+delayFor(i)+'f':'—';tap.setAttribute('aria-label',(state.enabled[i]?'Exclude':'Include')+' delayed frame tap '+(i+1));});
    document.querySelectorAll('[data-marker]').forEach(marker=>{const i=Number(marker.dataset.marker);marker.style.left=Math.max(0,100-delayFor(i)/(ECHO_CAP-1)*100)+'%';marker.style.opacity=state.enabled[i]&&i<state.count?1:0;});
    const win=document.querySelector('.time-window');win.style.left=(100-(state.offset+state.depth)/(ECHO_CAP-1)*100)+'%';win.style.width=state.depth/(ECHO_CAP-1)*100+'%';
    $('extended-controls').hidden=!state.extended;$('extended').setAttribute('aria-pressed',String(state.extended));$('extended').innerHTML=state.extended?'Match Echo again <span>↙</span>':'Explore 12 taps <span>↗</span>';
    $('p5-taps-value').textContent=state.p5Taps;$('p5-span-value').textContent=state.p5Span+'f';
    document.querySelectorAll('input[type=range]').forEach(input=>input.style.setProperty('--fill',100*(input.value-input.min)/(input.max-input.min)+'%'));
    if(markCustom)document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});
    updateRecipe();visualDirty=true;
  }

  function clearHistory() { echoStored=0;echoHead=0;p5Stored=0;p5Head=0;visualDirty=true;render(); }
  const presets={clean:{count:1,blend:0,depth:4,offset:0},ghosts:{count:4,blend:68,depth:24,offset:0},timefold:{count:4,blend:88,depth:72,offset:24}};
  function applyPreset(name) { Object.assign(state,presets[name],{enabled:[true,true,true,true],extended:false});document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.toggle('selected',b.dataset.preset===name);b.setAttribute('aria-pressed',String(b.dataset.preset===name));});updateUI(); }
  for(const id of ['count','blend','depth','offset'])$(id).addEventListener('input',event=>{state[id]=Number(event.target.value);updateUI(true);});
  taps.forEach((tap,i)=>tap.addEventListener('click',()=>{state.enabled[i]=!state.enabled[i];updateUI(true);}));
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
  $('pause').addEventListener('click',()=>{state.paused=!state.paused;accumulator=0;updateUI();});
  $('reset').addEventListener('click',()=>{state.p5Taps=12;state.p5Span=144;$('p5-taps').value=12;$('p5-span').value=144;applyPreset('ghosts');});
  $('clear').addEventListener('click',clearHistory);
  $('extended').addEventListener('click',()=>{state.extended=!state.extended;updateUI();});
  $('p5-taps').addEventListener('input',e=>{state.p5Taps=Number(e.target.value);updateUI();});$('p5-span').addEventListener('input',e=>{state.p5Span=Number(e.target.value);updateUI();});
  for(const id of ['echo-wrap','p5-wrap']) { const el=$(id);el.addEventListener('pointermove',e=>{if(state.input!=='demo')return;const r=el.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,active:true};});el.addEventListener('pointerleave',()=>pointer.active=false); }

  function stopCamera() { cameraRequest++;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;const video=$('video');video.pause();video.srcObject=null;cameraPending=false;$('camera').disabled=false; }
  function selectInput(input) { state.input=input;$('demo').classList.toggle('selected',input==='demo');$('camera').classList.toggle('selected',input==='camera');$('demo').setAttribute('aria-pressed',String(input==='demo'));$('camera').setAttribute('aria-pressed',String(input==='camera'));$('camera').innerHTML=input==='camera'?'● Camera on':'◉ Use camera';$('input-foot').innerHTML=input==='camera'?'Camera stays on your device. No recording.<br>Choose Animated scene to stop the camera.':'Move across either scene to steer the light.<br>Camera is optional and stays on your device.';drawSource();clearHistory(); }
  $('demo').addEventListener('click',()=>{stopCamera();selectInput('demo');notice('');});
  $('camera').addEventListener('click',async()=>{
    if(state.input==='camera'||cameraPending)return;
    if(!navigator.mediaDevices?.getUserMedia){notice('Camera access is unavailable in this browser. The animated scene is ready to use.');return;}
    cameraPending=true;$('camera').disabled=true;notice('Allow camera access in your browser to use live presence. Nothing is recorded or uploaded.');const request=++cameraRequest;let candidate;
    try{
      candidate=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:400},facingMode:'user'},audio:false});
      if(request!==cameraRequest){candidate.getTracks().forEach(t=>t.stop());return;}
      stream=candidate;const v=$('video');v.srcObject=stream;await v.play();
      if(request!==cameraRequest){candidate.getTracks().forEach(t=>t.stop());return;}
      selectInput('camera');notice('Camera is live. Move slowly to see your presence echo through time.');
      stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(state.input==='camera'){stopCamera();selectInput('demo');notice('Camera stopped. Switched back to the animated scene.');}}));
    }catch(err){if(candidate)candidate.getTracks().forEach(t=>t.stop());if(request!==cameraRequest)return;stopCamera();selectInput('demo');notice(err.name==='NotAllowedError'?'Camera permission was declined. You can keep exploring the animated scene.':err.name==='NotFoundError'?'No camera was found. The animated scene is ready to use.':'The camera could not start. You can keep exploring the animated scene.');}
    finally{if(request===cameraRequest){cameraPending=false;$('camera').disabled=false;}}
  });
  window.addEventListener('pagehide',stopCamera);
  document.addEventListener('visibilitychange',()=>{prevTime=0;accumulator=0;});

  function updateCode() { $('code-content').textContent=codeMode==='shader'?shaderText:p5Text;$('shader-tab').classList.toggle('selected',codeMode==='shader');$('p5-tab').classList.toggle('selected',codeMode==='p5');$('shader-tab').setAttribute('aria-pressed',String(codeMode==='shader'));$('p5-tab').setAttribute('aria-pressed',String(codeMode==='p5'));$('download').download=codeMode==='shader'?'echo.frag':'p5-sketch.js';$('download').href=codeMode==='shader'?window.__echoDownloads.shader:window.__echoDownloads.p5;$('code-note').textContent=codeMode==='shader'?'Original GLSL reference; the sandbox renders its equivalent in WebGPU. The prototype host supplies input textures, delay spacing and the tap toggles. ARTEX uniform compatibility should be checked in Studio.':'A standalone p5.js editor sketch with its own controls, reusable p5.Graphics slots and optional camera input. Camera error handling is provided by this playground; add your own when adapting the sketch.'; }
  $('shader-tab').addEventListener('click',()=>{codeMode='shader';updateCode();});$('p5-tab').addEventListener('click',()=>{codeMode='p5';updateCode();});
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(codeMode==='shader'?shaderText:p5Text);$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy code',1800);}catch{$('copy').textContent='Use download ↓';setTimeout(()=>$('copy').textContent='Copy code',2000);}});

  function animate(now) {
    if(disposed)return;
    if(!prevTime)prevTime=now;
    accumulator+=Math.min(now-prevTime,100);prevTime=now;
    if(!state.paused&&!document.hidden&&accumulator>=1000/FPS){state.time+=1/FPS;state.frame++;accumulator%=1000/FPS;drawSource();capture();visualDirty=true;}
    if(visualDirty)render();animationFrame=requestAnimationFrame(animate);
  }
  async function start() {
    drawSource();
    shaderText=window.__echoAssets.shader;p5Text=window.__echoAssets.sketch;updateCode();
    try { await initGPU(); } catch { gpuDevice?.destroy();notice('WebGPU is unavailable. The Echo cover remains still; you can explore the p5.js buffer comparison.'); }
    if(disposed)return;
    if(typeof window.p5==='function') {
      p5Instance=new window.p5(instance=>{instance.setup=()=>{if(disposed){instance.remove();return;}instance.pixelDensity(1);const renderer=instance.createCanvas(640,400);renderer.parent('p5-output');renderer.elt.setAttribute('aria-label','p5.js circular-buffer output');instance.noLoop();p=instance;visualDirty=true;};},$('p5-output'));
    } else { $('p5-state').textContent='p5.js unavailable';notice('The p5.js library did not load. Reload the page to restore the comparison.'); }
    state.paused=window.matchMedia('(prefers-reduced-motion: reduce)').matches;updateUI();drawSource();render();animationFrame=requestAnimationFrame(animate);
  }
  // Read-only diagnostics for deployment validation.
  window.__echoDiagnostics=()=>({state:JSON.parse(JSON.stringify(state)),echoStored,p5Stored,echoHead,p5Head,echoCapacity:ECHO_CAP,p5Capacity:P5_CAP,p5Version:window.p5?.VERSION,engine:gpu?'webgpu':'static',delays:Array.from({length:state.count},(_,i)=>delayFor(i)),errors:[...errorLog],cameraActive:!!stream?.active});
  window.__echoDispose=()=>{
    disposed=true;cancelAnimationFrame(animationFrame);stopCamera();
    p5Ring.forEach(slot=>slot.remove());p5Instance?.remove();gpuDevice?.destroy();gpuDevice=null;gpu=null;
  };
  window.addEventListener('pagehide',window.__echoDispose);
  start();
})();
