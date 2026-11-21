// The renderer is loaded only after the browser passes the WebGL and motion checks.
export function loadThree() {
  return import('./three.module.min.js');
}

export function hasWebGL({ failIfMajorPerformanceCaveat = true } = {}) {
  try {
    const canvas = document.createElement('canvas');
    const options = { failIfMajorPerformanceCaveat, powerPreference: 'low-power' };
    const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
