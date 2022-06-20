
const canvas = document.querySelector('#noise-graph');
const canvasContainer = document.querySelector('#graph-container')
canvas.width = canvasContainer.clientWidth;
canvas.height = canvasContainer.clientHeight;



/////////////////////////////////////////////////////
///////////// DATA STREAM GENERATOR /////////////////
/////////////////////////////////////////////////////

function* dataStreamGenerator(size = 1000) {
    while(true) {
        const data = [];
        for (let i = 0; i < size; i++) {
            data.push(Math.random());
            // data.push(Math.round(Math.random()));
        }
        yield data;
    }
}


///////////////////////////////////////////////////////
////////////// WEBGL UTILITY FUNCTIONS ////////////////
///////////////////////////////////////////////////////

// Code in this section taken from:
// https://webgl2fundamentals.org/webgl/lessons/webgl-boilerplate.html
/**
 * Creates and compiles a shader.
 *
 * @param {!WebGLRenderingContext} gl The WebGL Context.
 * @param {string} shaderSource The GLSL source code for the shader.
 * @param {number} shaderType The type of shader, VERTEX_SHADER or
 *     FRAGMENT_SHADER.
 * @return {!WebGLShader} The shader.
 */
function compileShader(gl, shaderSource, shaderType) {
    // Create the shader object
    const shader = gl.createShader(shaderType);

    // Set the shader source code.
    gl.shaderSource(shader, shaderSource);

    // Compile the shader
    gl.compileShader(shader);

    // Check if it compiled
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
        // Something went wrong during compilation; get the error
        throw ("could not compile shader:" + gl.getShaderInfoLog(shader));
    }

    return shader;
}

/**
 * Creates a program from 2 shaders.
 *
 * @param {!WebGLRenderingContext} gl The WebGL context.
 * @param {!WebGLShader} vertexShader A vertex shader.
 * @param {!WebGLShader} fragmentShader A fragment shader.
 * @return {!WebGLProgram} A program.
 */
function createProgram(gl, vertexShader, fragmentShader) {
    // create a program.
    const program = gl.createProgram();

    // attach the shaders.
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // link the program.
    gl.linkProgram(program);

    // Check if it linked.
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        // something went wrong with the link; get the error
        throw ("program failed to link:" + gl.getProgramInfoLog(program));
    }

    return program;
}

///////////////////////////////////////////////////////
/////////////////// NOISE GRAPH ///////////////////////
///////////////////////////////////////////////////////


/////////////////////////////////////////////////////
///////////////// Vertex Shader /////////////////////
/////////////////////////////////////////////////////

const vertexShaderSource = `#version 300 es

in vec2 position;

in float noiseValue;
out float v_noiseValue;

uniform int numGridCols;
uniform int numGridRows;
uniform int newColumnIndex;
uniform float widthDimension;
uniform float heightDimension;

void main() {

  int column = gl_InstanceID / numGridRows;

  int actualColumn = 0;
  if (newColumnIndex >= column) {
    actualColumn = (newColumnIndex - column);
  } else {
    actualColumn = newColumnIndex + (numGridCols - column);
  }

  float columnOffset = float(actualColumn) * widthDimension;
  
  int row = gl_InstanceID % numGridRows;
  float rowOffset = float(row) * heightDimension;

  gl_Position = vec4(
    position[0] + columnOffset, 
    position[1] + rowOffset, 
    0.0f, 
    1.0f
  );

  v_noiseValue = noiseValue;
}
`;


/////////////////////////////////////////////////////
/////////////// Fragment Shader /////////////////////
/////////////////////////////////////////////////////

const fragmentShaderSource = `#version 300 es
precision highp float;

in float v_noiseValue;

out vec4 FragColor;

void main() {

  if (v_noiseValue < 0.0f || v_noiseValue > 1.0f) {
    discard;
  }
  
  FragColor = vec4(
    v_noiseValue, 
    v_noiseValue, 
    v_noiseValue, 
    1.0f
  );
}
`;


// OpenGL uses the concept of a "rendering context"
// which is basically just a collection of settings
// that tell OpenGL how to render something whenever
// a draw call is made.  It is basically a large state
// machine and the state ultimately determines how
// pixels are rendered on the screen.  WebGL uses
// more of an object-oriented API while C / C++
// is a procedural type API.
const glContext = canvas.getContext('webgl2', {antialias: false}, "false");

if (!glContext) {
    console.log("Unable to acquire OpenGL context.");
}

// The maximum number of columns to display
// const GRID_COLUMNS = 500;

// The number of rows in the grid (i.e. the number
// of grid cells in each grid column);

const GRID_ROWS = 200;

// Height and width of an OpenGL window is 2.0 device coordinates in both directions
const GRID_CELL_HEIGHT = 2.0 / GRID_ROWS;
const GRID_CELL_WIDTH = GRID_CELL_HEIGHT * (glContext.canvas.height / glContext.canvas.width);
const GRID_COLUMNS = Math.floor(2.0 / GRID_CELL_WIDTH);


const NUM_GRID_CELLS = GRID_ROWS * GRID_COLUMNS;

// Create the shader program.  This consists of taking
// a vertex and fragment shader (which are written as
// plain strings), compiling them, and then linking them
// together into a shader program.  When you create a shader program,
// do it outside of the render loop.  You only need to compile it and
// create a shader program one time.
// Note: In OpenGL with C++, you can store vertex shaders and
//       fragment shaders in separate files.
const vertexShader = compileShader(glContext, vertexShaderSource, glContext.VERTEX_SHADER);
const fragmentShader = compileShader(glContext, fragmentShaderSource, glContext.FRAGMENT_SHADER);
const shaderProgram = createProgram(glContext, vertexShader, fragmentShader);

// After compiling the shader, we now have a program stored on
// the GPU that can be executed.  The rest of the process is
// setting up the data that is going to be sent to the GPU and
// passed into the vertex shader to start the graphics pipeline.
// The first thing that we need to do is query the OpenGL context
// for the "location" of each input variable that the vertex shader
// expects to receive from us (these are either "in" or "uniform" variables).
const positionAttributeLocation = glContext.getAttribLocation(shaderProgram, "position");
const noiseValueAttributeLocation = glContext.getAttribLocation(shaderProgram, "noiseValue");
const numGridColsUniformLocation = glContext.getUniformLocation(shaderProgram, "numGridCols");
const numGridRowsUniformLocation = glContext.getUniformLocation(shaderProgram, "numGridRows");
const newColumnIndexUniformLocation = glContext.getUniformLocation(shaderProgram, "newColumnIndex");
const widthDimensionUniformLocation = glContext.getUniformLocation(shaderProgram, "widthDimension");
const heightDimensionUniformLocation = glContext.getUniformLocation(shaderProgram, "heightDimension");




// Create a Vertex Array Object (VAO).  A VAO is basically
// an OpenGL object that you activate by binding it to the
// OpenGL context.  Once bound, the VAO "captures" the configuration
// information performed on vertex buffer objects.  The whole
// point of a VAO is to reduce the amount of setup calls we need
// to make when rendering vertices because it remembers the setup
// for us.
const VAO = glContext.createVertexArray();

// Next we will create Vertex Buffer Objects (VBO).  A VBO
// is basically a buffer (i.e. chunk of memory) on the GPU.
// We fill VBOs with data that will be passed into the
// vertex shader.  We will need two VBOs - one VBO will store
// the position data of each vertex for a grid cell (which
// is simply a square or a "quad").  The second VBO will
// contain the values that determine the color of each grid cell.
const quadPositionsVBO = glContext.createBuffer();
const noiseValueVBO = glContext.createBuffer();

// We can now go ahead and load our data into the VBOs
// (in effect, we are loading data from regular RAM into
// the RAM of the GPU).  We first bind the buffer to
// the proper "binding target".  Behind the scenes, this
// binding actually creates the VBO in the OpenGL context
// and binds it to the specified binding target.  Now,
// any OpenGL operations that act on that binding target
// will affect the VBO.

// Bind our quad VBO to the ARRAY_BUFFER target.  This way
// when we buffer the data, it goes into this VBO.
glContext.bindBuffer(glContext.ARRAY_BUFFER, quadPositionsVBO);

// Define the data for the vertex positions for our quad
// which represents a square (or grid cell) to be
// rendered in our noise graph.
const quadVertexPositions = [
    -1.0, -1.0,
    -1.0, -1.0 + GRID_CELL_HEIGHT,
    (-1.0 + GRID_CELL_WIDTH), -1.0,
    (-1.0 + GRID_CELL_WIDTH), -1.0 + GRID_CELL_HEIGHT
];

// We are now going to buffer the positions data (send the
// data to the VBO stored in GPU RAM).
glContext.bufferData(
    // Tell OpenGL that the data we are going to buffer
    // should go into the VBO that is bound to the
    // ARRAY_BUFFER target.
    glContext.ARRAY_BUFFER,
    // This argument is the actual data we are
    // sending to the GPU.  In our case, this
    // represents the vertex positions of each
    // of the vertices that make up a single grid cell.
    new Float32Array(quadVertexPositions),
    // This argument is a hint to OpenGL to tell
    // it that we do not plan on changing the
    // data after we buffer it to the GPU.
    glContext.STATIC_DRAW
);


// We will now buffer the initial noise values for the grid.
// We will use a value of -1 to allow us to easily discard
// the fragments.  This allows us to initially "hide" the
// grid cells because they won't have corresponding data
// when first loaded.  This also would allow to render
// missing columns in the event that data is not received
// for a particular time point for some reason.
glContext.bindBuffer(glContext.ARRAY_BUFFER, noiseValueVBO);

// Create a data buffer where each index represents
// a single grid cell - set the initial value for
// each index equal to -1
const noiseValueData = new Array(NUM_GRID_CELLS).fill(-1);

// We are now going to buffer the noise value data (send the
// data to the VBO stored in GPU RAM).
glContext.bufferData(
    // Tell OpenGL that the data we are going to buffer
    // should go into the VBO that is bound to the
    // ARRAY_BUFFER target.
    glContext.ARRAY_BUFFER,
    // This argument is the actual data we are
    // sending to the GPU.  In our case, this
    // represents the noise values of each grid cell.
    new Float32Array(noiseValueData),
    // This argument is a hint to OpenGL to tell
    // it that we plan on changing this data
    // frequently because we will be constantly
    // receiving new noise values and updating th grid
    glContext.DYNAMIC_DRAW
);

// Bind the VAO - this activates the VAO so that when we
// set up the VBOs, the VAO "captures" the settings so
// that we can easily set up draw calls in the future.
glContext.bindVertexArray(VAO);

// Now, we can configure the OpenGL context so that
// it knows how to extract the vertex shader variables
// out of our VBOs and pass them to the vertex shader
// when a draw call is initiated.  A VBO is just
// a raw data buffer - OpenGL does not know how to
// interpret the data unless we tell it how to do so.

// Here we re-bind the noiseValueVBO to the ARRAY_BUFFER
// binding target.  The reason that we do this is because
// one of the hidden features of the vertexAttribPointer()
// function is that it tells OpenGL that the VBO currently
// bound to the ARRAY_BUFFER binding target is the
// data that the vertex shader will fetch the
// attribute data from.
glContext.bindBuffer(glContext.ARRAY_BUFFER, noiseValueVBO);

// This command tells OpenGL that we want to enable
// the value vertex attribute in our shader program.
// This tells OpenGL that when the vertex shader is executed
// on each vertex of our mesh, it needs to pull the
// corresponding data for each of the vertices.
glContext.enableVertexAttribArray(noiseValueAttributeLocation);
glContext.vertexAttribDivisor(noiseValueAttributeLocation, 1);

// Now that we have told the OpenGL context that it
// needs to pull the noise value data (which will determine the
// color of each grid cell), we now need to tell OpenGL
// which VBO the GPU needs to pull the data from and
// how to interpret the data that it pulls out for each vertex.
glContext.vertexAttribPointer(
    // Tells OpenGl that we are describing how the
    // data should be interpreted for the "value" variable
    // within our vertex shader.
    noiseValueAttributeLocation,
    // This tells OpenGL that the "value" variable
    // consists of only one component since
    // each value is a float value representing the noise
    1,
    // This tells OpenGL that the data is supposed to
    // be interpreted as a float type.
    glContext.FLOAT,
    // Tells OpenGL not to normalize the data
    false,
    // This argument is the stride.  OpenGL allows you
    // to store the data for multiple vertex attributes
    // (the "in" variables in the vertex shader) in a single
    // buffer object.  Since we have a dedicated VBO for
    // our noise values, the VBO data is tightly packed and thus
    // the stride is 0 meaning that each index within the array
    // stores a noise value data point.
    0,
    // This tells OpenGL to start pulling the data for the
    // first vertex at an index of 0 in the VBO.
    0
);

// Now, we are going to do the same thing for the positions
// data.
glContext.bindBuffer(glContext.ARRAY_BUFFER, quadPositionsVBO);
glContext.enableVertexAttribArray(positionAttributeLocation);

glContext.vertexAttribPointer(
    // Tells OpenGl that we are describing how the
    // data should be interpreted for the "value" variable
    // within our vertex shader.
    positionAttributeLocation,
    // This tells OpenGL that the "value" variable
    // consists of two components because each
    // vertex position is an (x, y) value consisting
    // of 2 float values
    2,
    // This tells OpenGL that the data is supposed to
    // be interpreted as a float type.
    glContext.FLOAT,
    // Tells OpenGL not to normalize the data
    false,
    // This argument is the stride.  OpenGL allows you
    // to store the data for multiple vertex attributes
    // (the "in" variables in the vertex shader) in a single
    // buffer object.  Since we have a dedicated VBO for
    // our position values, the VBO data is tightly packed and thus
    // the stride is 0 meaning that each index within the array
    // stores a position data point.
    0,
    // This tells OpenGL to start pulling the data for the
    // first vertex at an index of 0 in the VBO.
    0
);

// Binding a value of 0 indicates that we are
// unbinding the currently bound VBO from the
// specified binding target - it is always good to
// do this to prevent issues related to accidentally
// writing a VBO because you do not realize it is
// bound to the binding target.
// ** WebGL uses null, but C / C++ uses 0 **
glContext.bindBuffer(glContext.ARRAY_BUFFER, null);


// Set the size of the viewport
glContext.viewport(0, 0, glContext.canvas.width, glContext.canvas.height);

// Set the clear color (this is the color that will
// be used to fill the color buffer (part of the frame buffer)
// when we call the clear() function.
glContext.clearColor(0, 0, 1.0, 1);

// Clear the color buffer and the depth buffer -
// this is basically resetting the canvas to
// a blank screen before rendering
glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);

// Set the active shader program
glContext.useProgram(shaderProgram);

// Unlike vertex attributes that specify an individual
// value for each individual vertex, a Uniform
// is a variable that is the same for each of the
// vertices.  Here, we are setting the initial value
// of these uniforms.
glContext.uniform1i(numGridRowsUniformLocation, GRID_ROWS);
glContext.uniform1i(numGridColsUniformLocation, GRID_COLUMNS);
glContext.uniform1i(newColumnIndexUniformLocation, 0);
glContext.uniform1f(widthDimensionUniformLocation, GRID_CELL_WIDTH);
glContext.uniform1f(heightDimensionUniformLocation, GRID_CELL_HEIGHT);



// Bind the VAO which basically sets up the OpenGL
// context to all the settings we specified earlier
// so that we can now make a draw call which
// will start the GPU pipeline by invoking the
// vertex shader.
// glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, 0);


/////////////////////////////////////////////////////
///////////////// Render Loop ///////////////////////
/////////////////////////////////////////////////////

const dataStream = dataStreamGenerator(GRID_ROWS);
const FLOAT_BYTES = 4;

let newColumnIndex = -1;

function renderNoiseGraph() {
    // Clear the contents of the frame buffer before rendering
    glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);
    const newNoiseValueData = dataStream.next().value;
    newColumnIndex = (newColumnIndex + 1) % GRID_COLUMNS;
    let bufferOffset = newColumnIndex * GRID_ROWS * FLOAT_BYTES;

    glContext.bindVertexArray(VAO);
    glContext.uniform1i(newColumnIndexUniformLocation, newColumnIndex);
    glContext.bindBuffer(glContext.ARRAY_BUFFER, noiseValueVBO);
    glContext.bufferSubData(
        glContext.ARRAY_BUFFER,
        bufferOffset,
        new Float32Array(newNoiseValueData),
        0
    );

    // Bind the VAO which basically sets up the OpenGL
    // context to all the settings we specified earlier
    // so that we can now make a draw call which
    // will start the GPU pipeline by invoking the
    // vertex shader.
    glContext.drawArraysInstanced(glContext.TRIANGLE_STRIP, 0, 4, NUM_GRID_CELLS);
}

// renderNoiseGraph();
window.setInterval(renderNoiseGraph, 125);
