struct CameraUniforms {
    viewProjMat: mat4x4f,
    inverseProjMat: mat4x4f,
    viewMat: mat4x4f,          
    screenDimensions: vec2f,
    nearPlane: f32, 
    farPlane: f32
}