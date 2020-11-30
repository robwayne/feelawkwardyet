// based on this: https://www.shadertoy.com/view/wdBXRW

let myShader;
let poseNet;
let poses = [];
// this variable will hold our createGraphics layer
let shaderGraphics;
var capture;
var w;
var h;
var points;

var leftEyeVec2;
var rightEyeVec2;

function preload() {
  myShader = loadShader("posenet_eyes.vert", "posenet_eyes.frag");
}

function setup() {
  pixelDensity(2);
  w = windowWidth;
  h = windowHeight;
  leftEyeVec2 = [w/2,h/2];
  rightEyeVec2 = [w/2, h/2];
  // w = 640;
  // h = 480; 
  createCanvas(w, h, WEBGL);

  capture = createCapture(VIDEO);
  capture.size(w, h);
  capture.hide();

  // Create a new poseNet method with a single detection
  poseNet = ml5.poseNet(capture, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function(results) {
    poses = results;
  });

  shaderGraphics = createGraphics(w, h, WEBGL);
  shaderGraphics.noStroke();
}

const getEyePositions = () => {
  for (let i = 0; i < poses.length && i == 0; i++) {
    // For each pose detected, loop through all the keypoints

    let pose = poses[i].pose;

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
  getEyePositions();
  {

    shaderGraphics.shader(myShader);

    // Send things to the shader via "uniforms"
    myShader.setUniform("iResolution", [shaderGraphics.width, shaderGraphics.height]);
    // leftEyeVec2[0] = map(leftEyeVec2[0], 0, shaderGraphics.width, shaderGraphics.width, 0); // webcam image is flipped so flip x 
    // rightEyeVec2[0] = map(leftEyeVec2[0], 0, shaderGraphics.width, shaderGraphics.width, 0);
    let x = (leftEyeVec2[0] + rightEyeVec2[0]) / 2;
    x = map(x, 0, shaderGraphics.width, shaderGraphics.width, 0);
    const y = (leftEyeVec2[1] + rightEyeVec2[1]) / 2;
    const Y = map(y, 0, shaderGraphics.height, shaderGraphics.height, 0)
    const X = map(x, 0, shaderGraphics.width, 0, shaderGraphics.width*2)
    myShader.setUniform("iMouse", [x, Y]);
    // if (leftEyeVec2) myShader.setUniform("iMouse",leftEyeVec2);
    myShader.setUniform("iTime", frameCount/12);
    // myShader.setUniform('leftEye', leftEyeVec2);

    shaderGraphics.rect(0, 0, shaderGraphics.width, shaderGraphics.height);
  }
  push();
  ortho(0, w/2, -h/2, -h, 0, 20000);
  image(shaderGraphics, 0, 0, w, h);
  translate(-2*w -h/2, 0);
  pop()
}

function modelReady() {
  console.log('Model Loaded');
}
