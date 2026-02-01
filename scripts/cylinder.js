// Cylinder renderer: captures `.wheel` (the main content wrapper) into a texture
// and maps it onto a 3D cylinder using WebGL. This is a lightweight implementation
// tuned for clarity rather than a full-featured engine.

(function(){
  // Guard: don't run if reduced motion is requested
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('cylinder-canvas');
  if (!canvas) return;

  // Ensure the original content is available for SR and forms; we'll hide visually.
  const contentEl = document.querySelector('.wheel') || document.querySelector('main');
  if (!contentEl) return;

  // Params
  const SEG_X = 48; // horizontal subdivisions (across page width)
  const SEG_Y = 300; // vertical subdivisions (along page height) - reduced for mobile perf
  const RADIUS = 420; // px virtual radius (will be scaled)
  const ANGLE_RANGE = Math.PI; // half-wrap so content never goes fully to the backside
  const CAMERA_Z = 1200; // camera distance

  let gl, program, texture, mesh, vao;
  let textureWidth = 1, textureHeight = 1;

  // Initialize WebGL and resources
  function initGL(){
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  gl = canvas.getContext('webgl2', {antialias:true});
  if (!gl){ console.warn('WebGL2 not available — cylinder renderer disabled.'); gl = null; return; }

    // Shaders
    const vs = `#version 300 es
    in vec2 a_uv; // (u across width, v along height)
    uniform float u_radius;
    uniform float u_axisWidth; // width across x in world units
    uniform float u_angleRange;
    uniform float u_scrollAngle; // rotation along circumference
    uniform float u_texH; // texture height in pixels (world height)
    uniform mat4 u_mvp;
    out vec2 v_tex;

    void main(){
      float u = a_uv.x; // 0..1
      float v = a_uv.y; // 0..1
      // map u across axis width (X axis)
      float x = (u - 0.5) * u_axisWidth;
      // map v to an angle around the wheel (theta)
      float theta = (v - 0.5) * u_angleRange + u_scrollAngle;
      float y = u_radius * sin(theta);
      float z = u_radius * cos(theta);
      // build position
      vec4 pos = vec4(x, y, z, 1.0);
      gl_Position = u_mvp * pos;
      // texture coordinates: sample original texture using (u,v)
      v_tex = vec2(u, 1.0 - v);
    }
    `;

    const fs = `#version 300 es
    precision highp float;
    in vec2 v_tex;
    uniform sampler2D u_tex;
    out vec4 outColor;
    void main(){
      vec4 c = texture(u_tex, v_tex);
      if (c.a < 0.02) discard; // improve edge blending
      outColor = c;
    }
    `;

    program = createProgram(gl, vs, fs);
    gl.useProgram(program);

    // Create texture placeholder
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create mesh buffers (a grid of triangles parametrized by uv)
    const verts = [];
    const indices = [];
    for (let y=0;y<=SEG_Y;y++){
      const v = y/SEG_Y;
      for (let x=0;x<=SEG_X;x++){
        const u = x/SEG_X;
        verts.push(u, v);
      }
    }
    for (let y=0;y<SEG_Y;y++){
      for (let x=0;x<SEG_X;x++){
        const i = y*(SEG_X+1)+x;
        indices.push(i, i+1, i+SEG_X+1);
        indices.push(i+1, i+SEG_X+2, i+SEG_X+1);
      }
    }

    // VAO
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const a_uv = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(a_uv);
    gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    mesh = {count: indices.length};

    gl.bindVertexArray(null);
  }

  // Create program helper
  function createProgram(gl, vsSource, fsSource){
    const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }
  function compile(gl, type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // Build MVP matrix (simple perspective)
  function buildMVP(){
    const aspect = canvas.width / canvas.height;
    const fov = 45 * Math.PI/180;
    const near = 0.1, far = 5000;
    const f = 1.0 / Math.tan(fov/2);
    const proj = [
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)/(near-far),-1,
      0,0,(2*far*near)/(near-far),0
    ];
    // simple lookAt at origin from z = CAMERA_Z
    const eye = [0,0,CAMERA_Z];
    const center = [0,0,0];
    const up = [0,1,0];
    const z0 = normalize(sub(eye, center));
    const x0 = normalize(cross(up, z0));
    const y0 = cross(z0, x0);
    const view = [
      x0[0], y0[0], z0[0], 0,
      x0[1], y0[1], z0[1], 0,
      x0[2], y0[2], z0[2], 0,
      -dot(x0, eye), -dot(y0, eye), -dot(z0, eye), 1
    ];
    // Multiply proj * view
    return multiplyMatrices(proj, view);
  }

  // math helpers
  function sub(a,b){return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]}
  function length(v){return Math.sqrt(dot(v,v))}
  function normalize(v){const l=length(v)||1;return [v[0]/l,v[1]/l,v[2]/l]}
  function multiplyMatrices(a,b){
    const out = new Array(16).fill(0);
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++) out[i*4+j]+=a[i*4+k]*b[k*4+j];
    return out;
  }

  // Upload texture from a canvas (the html2canvas result)
  function uploadTextureFromCanvas(srcCanvas){
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    textureWidth = srcCanvas.width;
    textureHeight = srcCanvas.height;
  }

  // Render loop
  let lastScroll = 0;
  function tick(){ render(); requestAnimationFrame(tick); }
  function render(){
    if(!gl) return;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // uniforms
    const u_radius = gl.getUniformLocation(program, 'u_radius');
    const u_axisWidth = gl.getUniformLocation(program, 'u_axisWidth');
    const u_angleRange = gl.getUniformLocation(program, 'u_angleRange');
    const u_scrollAngle = gl.getUniformLocation(program, 'u_scrollAngle');
    const u_texH = gl.getUniformLocation(program, 'u_texH');
    const u_mvp = gl.getUniformLocation(program, 'u_mvp');

    gl.uniform1f(u_radius, RADIUS);
    // axis width: we want the cylinder axis to match content width in world units
    const axisWidth = (canvas.width / devicePixelRatio) * 0.9; // a bit narrower than full width
    gl.uniform1f(u_axisWidth, axisWidth);
    gl.uniform1f(u_angleRange, ANGLE_RANGE);

    // compute scrollFraction and map to scrollAngle so page scroll rotates cylinder
    const vh = window.innerHeight;
    const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, vh);
    const scrollY = window.scrollY || window.pageYOffset || 0;

    const frac = docH <= vh ? 0 : scrollY / (docH - vh);
    const scrollAngle = frac * ANGLE_RANGE; // one full wrap across entire document
    gl.uniform1f(u_scrollAngle, scrollAngle - Math.PI/2.0); // offset so start faces front
    gl.uniform1f(u_texH, textureHeight);

    const mvp = buildMVP();
    gl.uniformMatrix4fv(u_mvp, false, new Float32Array(mvp));

    // bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const texLoc = gl.getUniformLocation(program, 'u_tex');
    gl.uniform1i(texLoc, 0);

    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  // Capture content using html2canvas and initialize GL
  async function captureAndStart(){
    // capture the content area (the full document height) first
    const scale = Math.min(1.5, devicePixelRatio || 1);
    let canvasCapture;
    try{
      canvasCapture = await html2canvas(document.body, {scale: scale, useCORS:true, logging:false});
    }catch(e){
      console.error('html2canvas failed', e);
      return;
    }

    // init GL with mesh/program
    initGL();
    if (!gl){
      // WebGL not available — ensure DOM content remains visible and canvas stays hidden
      contentEl.style.visibility = '';
      contentEl.removeAttribute('aria-hidden');
      canvas.style.display = 'none';
      return;
    }

    uploadTextureFromCanvas(canvasCapture);

    // now it's safe to show the canvas and hide the live DOM visually
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.zIndex = '9999';
    canvas.style.pointerEvents = 'none';

    contentEl.style.visibility = 'hidden';
    contentEl.setAttribute('aria-hidden', 'true');

    // start animation loop
    tick();
  }

  // Recreate capture on resize (debounced)
  let resizeTO = 0;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTO); resizeTO = setTimeout(()=>{
      // re-capture and re-upload texture for correct sizing
      captureAndStart().catch(console.error);
    }, 400);
  });

  // Start after a short delay so fonts/styles are ready
  window.addEventListener('load', ()=>{
    setTimeout(()=>{ captureAndStart().catch(console.error); }, 750);
  });

})();
