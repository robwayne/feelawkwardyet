
// based on this: https://www.shadertoy.com/view/wdBXRW
// 'use strict';

let myShader;
let poseNet;
let poseArr = [];
let shaderGraphics;
var capture;
var w;
var h;
var points;
var smoothedPos;
var leftEyeVec2;
var rightEyeVec2;
var previousTime = 0;
var timePassed = 5000;
var toggleCheck = 0;
var canv;
// framebuffer
var fbo;

var tex = {
  src: null,
  dst: null,
  swap: function() {
    var tmp = this.src;
    this.src = this.dst;
    this.dst = tmp;
  }
};

// shader
var shaderfiles = {};
var shader_grayscott;
var shader_display;

// offscreen resolution scale factor.
var SCREEN_SCALE = 1.0;

// reaction diffusion settings and presets
var rdDef = {
  name: 'ReactionDiffusion',
  da: 1.0,
  db: 0.6,
  feed: 0.04,
  kill: 0.06,
  dt: 1.0,
  iter: 10,
  reset: initRD,
}

// Our own variables
const handsOnFaceImages = [];
let imageSize = 140;
let xPos = 0;
let yPos = 0;
const padding = 20;
const filenamePrefix = 'handFace-screenshot';
let screenshotIndex = 0;
let prevToggleValue = 0;
const maxImagesPerShader = 16;
let numImages = 0;

function preload() {
  myShader = loadShader("shader.vert", "shader.frag");
}

function setup() {
  pixelDensity(1);
  w = windowWidth;
  h = windowHeight;
  imageSize = w/8;
  leftEyeVec2 = [w/2,h/2];
  rightEyeVec2 = [w/2, h/2];
  // w = 1280;
  // h = 960;
  canv = createCanvas(w, h, WEBGL);
  // noStroke();
  let constraints = {
    video: {
      mandatory: {
        maxWidth: w,
        maxHeight: h
      }
    },
    audio: false
  };
  capture = createCapture(constraints);
  capture.hide();


  // Create a new poseNet method with a single detection
  poseNet = ml5.poseNet(capture, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function(results) {
    poseArr = results;
  });

  shaderGraphics = createGraphics(w, h, WEBGL);
  shaderGraphics.noStroke();

  // difusion
   // webgl context
  var gl = this._renderer.GL;

  // webgl version (1=webgl1, 2=webgl2)
  var VERSION = gl.getVersion();
  gl.c

  console.log("WebGL Version: " + VERSION, gl.c);


  //get some webgl extensions
  // if(VERSION === 1){
  // var ext = gl.newExt(['OES_texture_float', 'OES_texture_float_linear'], true);
  // }
  // if(VERSION === 2){
  // var ext = gl.newExt(['EXT_color_buffer_float'], true);
  // }

  //beeing lazy ... load all available extensions.
  gl.newExt(gl.getSupportedExtensions(), true);
  // create FrameBuffer for offscreen rendering
  fbo = gl.newFramebuffer();

  //create Textures for multipass rendering
  var def = {
    target: gl.TEXTURE_2D,
    iformat: gl.RGBA32F,
    format: gl.RGBA,
    type: gl.FLOAT,
    wrap: gl.CLAMP_TO_EDGE,
    filter: [gl.NEAREST, gl.LINEAR]
  }


  var tex_w = ceil(width * SCREEN_SCALE);
  var tex_h = ceil(height * SCREEN_SCALE);

  tex.src = gl.newTexture(tex_w, tex_h, def);
  tex.dst = gl.newTexture(tex_w, tex_h, def);



  // Shader source, depending on available webgl version
  // var fs_grayscott = document.getElementById("webgl"+VERSION+".fs_grayscott").textContent;
  // var fs_display   = document.getElementById("webgl"+VERSION+".fs_display"  ).textContent;

  var fs_grayscott = shaderfiles["webgl" + VERSION + ".fs_grayscott"];
  var fs_display = shaderfiles["webgl" + VERSION + ".fs_display"];
  // crreate Shader
  shader_grayscott = new Shader(gl, {
    fs: fs_grayscott
  });
  shader_display = new Shader(gl, {
    fs: fs_display
  });


  // place initial samples
  initRD();

  smoothedPos = createVector(width/2,height/2);
}

function windowResized() {
  if (!fbo) return;
  var w = windowWidth;
  var h = windowHeight;
  resizeCanvas(w, h);

  var tex_w = ceil(w * SCREEN_SCALE);
  var tex_h = ceil(h * SCREEN_SCALE);

  tex.src.resize(tex_w, tex_h);
  tex.dst.resize(tex_w, tex_h);

  initRD();
}



// shading colors
var pallette = [
  1.00, 1.00, 1.00,
  0.00, 0.40, 0.80,
  0.20, 0.00, 0.20,
  1.00, 0.80, 0.40,
  0.50, 0.25, 0.12,
  0.50, 0.50, 0.50,
  0.00, 0.00, 0.00
];

function randomizeColors() {
  var num = pallette.length / 3;
  for (var i = 1; i < num - 1; i++) {
    var id = i * 3;
    var r = random(1);
    var g = random(1);
    var b = random(1);

    pallette[id + 0] = r;
    pallette[id + 1] = g;
    pallette[id + 2] = b;
  }
}

function keyReleased() {
  if (key === 'C') {
    randomizeColors();
  }
}

const getEyePositions = () => {
  for (let i = 0; i < poseArr.length && i == 0; i++) {
    // For each pose detected, loop through all the keypoints
    let pose = poseArr[i].pose;
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let leftEye = pose.keypoints[1];
      let rightEye = pose.keypoints[2];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (leftEye.score > 0.2 && rightEye.score > 0.2) {
        leftEyeVec2 = [leftEye.position.x, leftEye.position.y];
        rightEyeVec2 = [rightEye.position.x, rightEye.position.y];
      }
    }
  }
}

function draw() {
  checkHandsOnFace();
  getEyePositions();
  resetShader();
  shaderGraphics.reset()
  shaderGraphics.remove();
  shaderGraphics.background(255)
  //use the external shaders: shader.frag and shader.vert
  if (toggleCheck < 2 || toggleCheck === 4) {
    const check = toggleCheck;
    // run this block first just cuz
    {
      shaderGraphics.shader(myShader);
      myShader.setUniform("resolution", [shaderGraphics.width, shaderGraphics.height]);
      myShader.setUniform("frameCount", frameCount/12);
      shaderGraphics.rect(0, 0, shaderGraphics.width, shaderGraphics.height);
    }

    if (toggleCheck < 2) { 
      if (millis() > previousTime + timePassed) {
        previousTime = millis();
        toggleCheck += 1;
      }
      
      // leftEyeVec2[0] = map(leftEyeVec2[0], 0, shaderGraphics.width, shaderGraphics.width, 0); // webcam image is flipped so flip x
      // rightEyeVec2[0] = map(leftEyeVec2[0], 0, shaderGraphics.width, shaderGraphics.width, 0);
      let x = (leftEyeVec2[0] + rightEyeVec2[0]) / 2;
      x = map(x, 0, shaderGraphics.width, shaderGraphics.width, 0);
      const y = (leftEyeVec2[1] + rightEyeVec2[1]) / 2;
      const Y = map(y, 0, shaderGraphics.height, shaderGraphics.height, 0)
      const X = map(x, 0, shaderGraphics.width, 0, shaderGraphics.width*2)
      myShader.setUniform("mouse", [x, Y]);
      myShader.setUniform("cam", capture);
    }
    //update the shader only if toggleCheck was changed
    // if (check !== toggleCheck) {
    //   myShader.setUniform("toggleCheck", toggleCheck);
    // }
    myShader.setUniform("toggleCheck", toggleCheck);
    push();
    // ortho(-w/2, w/2, 0, h/2, 0, 20000);
    translate(-width / 2, -height / 2, 0);
    image(shaderGraphics, 0, 0, w, h);
    // translate(-2*w -h/2, 0);
    pop();

  } else if (toggleCheck === 2) {

    if (millis() > previousTime + timePassed) { 
      previousTime = millis();
      toggleCheck += 1;
      console.log("going to 3")
    }

    if (!fbo) return;
    // ortho(0, width, -height, 0, 0, 20000);
    push();
    ortho();
    translate(-width / 2, -height / 2, 0);
    updateRD();
    pop();

    var w = tex.dst.w / SCREEN_SCALE;
    var h = tex.dst.h / SCREEN_SCALE;

    // display result
    shader_display.viewport(0, 0, w, h);
    shader_display.begin();
    shader_display.uniformF('PALLETTE', pallette, 7);
    shader_display.uniformT('tex', tex.src);
    shader_display.uniformF('wh_rcp', [1.0 / w, 1.0 / h]);
    shader_display.quad();
    shader_display.end();
  } else if (toggleCheck === 3) {
    if (millis() > previousTime + 5*timePassed) { 
      previousTime = millis();
      toggleCheck += 1;
      console.log("going to 4")
    }
    layoutImages();
  }
}


function initRD() {
  ortho();
  // translate(-width/2, -height/2, 0);

  var gl = fbo.gl;

  // bind framebuffer and texture for offscreenrendering
  fbo.begin(tex.dst);

  var w = tex.dst.w;
  var h = tex.dst.h;

  gl.viewport(0, 0, w, h);
  gl.clearColor(1.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  // < native p5 here
  noStroke();
  fill(0, 255, 0);
  // ellipse(-100, 0, 100, 100);
  // ellipse(+100, 0, 100, 100);
  // ellipse(0, -100, 100, 100);
  // ellipse(0, +100, 100, 100);
  // >
  tex.swap();
  fbo.end();

}
function updateRD() {

  var gl = fbo.gl;

  // multipass rendering (ping-pong)
  for (var i = 0; i < rdDef.iter; i++) {

    // set texture as rendertarget
    fbo.begin(tex.dst);

    var w = tex.dst.w;
    var h = tex.dst.h;

    // clear texture
    gl.viewport(0, 0, w, h);
    gl.clearColor(1.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // apply shader
    shader_grayscott.begin();
    shader_grayscott.uniformF("dA", [rdDef.da]);
    shader_grayscott.uniformF("dB", [rdDef.db]);
    shader_grayscott.uniformF("feed", [rdDef.feed]);
    shader_grayscott.uniformF("kill", [rdDef.kill]);
    shader_grayscott.uniformF("dt", [rdDef.dt]);
    shader_grayscott.uniformF("wh_rcp", [1.0 / w, 1.0 / h]);
    shader_grayscott.uniformT("tex", tex.src);
    shader_grayscott.quad();
    shader_grayscott.end();

    // < native p5 here
    if (mouseIsPressed) {
      noStroke();
      fill(0, 255, 0);
      ellipse(mouseX, mouseY, 10, 10);

      ellipse(mouseY, mouseX, 10, 10);
    }
    // drawKeypoints();
    drawSkeleton();
    if (poseArr.length > 0) {
      let pose = poseArr[0].pose;
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[0]; //nose
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > 0.2) {

        let curPos = createVector(map(keypoint.position.x, 0, 640, 0, width), map(keypoint.position.y, 0, 480, 0, height));
        curPos.sub(smoothedPos);
        curPos.mult(.1);
        smoothedPos.add(curPos);
        // ellipse(smoothedPos.x, smoothedPos.y, 50, 50);
      }

    }
    fill(0, 255, 0);
    noStroke();
    ellipse(smoothedPos.x, smoothedPos.y, 150, 150);
    // >

    // ping-pong
    tex.swap();
  }

  // end fbo, so p5 can take over again.
  fbo.end();
}



// A function to draw ellipses over the detected keypoints
function drawKeypoints() {
  // points = [];

  // Loop through all the poses detected
  for (let i = 0; i < poseArr.length && i == 0; i++) {
    // For each pose detected, loop through all the keypoints

    let pose = poseArr[i].pose;

    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > 0.2) {
        fill(0, 255, 0);
        noStroke();
        ellipse(map(keypoint.position.x, 0, 640, 0, width), map(keypoint.position.y, 0, 480, 0, height), 5, 5);
      }
    }
  }
}

// A function to draw the skeletons
function drawSkeleton() {
  // Loop through all the skeletons detected
  for (let i = 0; i < poseArr.length; i++) {
    let skeleton = poseArr[i].skeleton;
    // For every skeleton, loop through all body connections
    for (let j = 0; j < skeleton.length; j++) {
      let partA = skeleton[j][0];
      let partB = skeleton[j][1];
      stroke(0, 255, 0);
      line(map(partA.position.x, 0, 640, 0, width), map(partA.position.y, 0, 480, 0, height), map(partB.position.x, 0, 640, 0, width), map(partB.position.y, 0, 480, 0, height));
    }
  }
}


(function() {

  var loadJS = function(filename) {
    var script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", filename);
    document.getElementsByTagName("head")[0].appendChild(script);
  }

  loadJS("https://rawgit.com/diwi/p5.EasyCam/master/dwgl.js");
  // loadJS("https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.6.5/dat.gui.min.js");

  document.oncontextmenu = function() {
    return false;
  }
  document.onmousedown = function() {
    return false;
  }

})();

function modelReady() {
  console.log('Model Loaded');
}

const pointsOverlap = (p1, p2) => {
  const xMaxDist = 50;
  const yMaxDist = 150;
  return (abs(p1.x - p2.x) <= xMaxDist) && (abs(p1.y - p2.y) <= yMaxDist);
}

const checkKeypointScore = (...points) => {
  for(let point of points) {
    if (point.score < 0.2) return false;
  }
  return true;
}

const checkHandsOnFace = () => {
  for (let i=0;i<poseArr.length;i++) {
    if (i > 1) continue;
    const pose = poseArr[i].pose;
    // index of nose, leftEye, and rightEye are 0, 1, 2 respectively
    const { keypoints } = pose;
    if (keypoints && keypoints.length) {
      const facialPointsLength = 3;
      const lw = keypoints[9];
      const rw = keypoints[10];
      // if (!checkKeypointScore(lw, rw)) continue;
      for (let n=0;n<facialPointsLength;n++) {
        const facePoint = keypoints[n];
        const { position: fpPosition } = facePoint;
        if (checkKeypointScore(facePoint)) {
          if (pointsOverlap(fpPosition, lw.position) || pointsOverlap(fpPosition, rw.position)) {
            // let padding = handsOnFaceImages.length ? 10 : 0;
            // xPos = padding + imageSize * handsOnFaceImages.length;
            // if (xPos > width) {
            //   yPos += imageSize;
            //   xPos = 0;
            //   padding = 0;
            // }
            // const filename = filenamePrefix + screenshotIndex;
            // screenshotIndex++;
            // handsOnFaceImages.push(filename);
            // saveCanvas(capture, filename);
            if (numImages < maxImagesPerShader && prevToggleValue === toggleCheck) {
              handsOnFaceImages.push(capture.get(0,0,w,h));
              console.log("taking screenshot", handsOnFaceImages[handsOnFaceImages.length-1]);
              numImages++;
            } else if (numImages === maxImagesPerShader && prevToggleValue !== toggleCheck) {
              numImages = 0;
              prevToggleValue = toggleCheck;
            }
            // image(capture, xPos, yPos, imageSize, imageSize)
          }
        }
      }
    }
  }
};

const layoutImages = () => {  
  for (let i=0;i<handsOnFaceImages.length;i++) {
    
    push();
    ortho();
    translate(-width / 2, -height / 2, 0);
    image(handsOnFaceImages[i], xPos, yPos, imageSize*4, imageSize*4);
    pop();
    
    xPos += imageSize + padding;
    if (xPos >= w) {
      yPos += imageSize + padding;
      xPos = 0;
    }
    if (yPos >= h) break;
  }
}
