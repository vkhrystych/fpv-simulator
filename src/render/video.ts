import * as THREE from 'three'

/**
 * Аналоговий відеотракт одним повноекранним проходом:
 * горизонтальні смуги шуму, зрив синхронізації, дисторсія об'єктива,
 * віньєтка та сканлайни. Якість керується одним числом signal ∈ [0,1].
 */
const FRAGMENT = /* glsl */ `
  uniform sampler2D tSource;
  uniform float uTime;
  uniform float uSignal;
  uniform float uMono;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // нелінійно: до ~0.75 картинка майже чиста, розсипається лише на хвості.
    // Лінійна залежність робила помітний шум навіть на добрій ланці.
    float noiseAmount = 1.0 - smoothstep(0.12, 0.8, uSignal);

    // дисторсія об'єктива (barrel), унормована так, щоб кути кадру лишались
    // усередині текстури — інакше по краях екрана з'являється смуга «снігу»
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    const float K = 0.16;
    vec2 uv = 0.5 + c * (1.0 + K * r2) / (1.0 + K * 0.5);

    // зрив рядків: чим гірший сигнал, тим частіші та ширші розриви
    float line = floor(uv.y * uResolution.y);
    float glitchSeed = hash(vec2(line, floor(uTime * 24.0)));
    float glitch = step(1.0 - noiseAmount * 0.35, glitchSeed);
    uv.x += glitch * (glitchSeed - 0.5) * 0.14 * noiseAmount;

    // повна втрата кадру
    float rollSeed = hash(vec2(floor(uTime * 7.0), 3.7));
    float dropout = step(1.0 - noiseAmount * 0.5, rollSeed);
    uv.y = fract(uv.y + dropout * rollSeed * 0.6);

    vec3 col;
    // за межами кадру — сніг, а не завернута текстура: інакше низ екрана
    // показує шматок неба, якого там бути не може
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      col = vec3(hash(uv * uTime));
    } else {
      // легкий хроматичний розліт по краях кадру
      float ca = 0.0016 * (1.0 + noiseAmount * 3.0);
      col.r = texture2D(tSource, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tSource, uv).g;
      col.b = texture2D(tSource, uv - vec2(ca, 0.0)).b;
      // сцена прийшла з render target у ЛІНІЙНОМУ просторі — three.js не робить
      // перетворення при рендері в буфер. Переводимо в екранний sRGB тут,
      // інакше все нижче горизонту виглядає чорним.
      col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    }

    // зернистість сенсора
    float grain = hash(uv * uResolution + uTime * 60.0);
    col += (grain - 0.5) * (0.03 + noiseAmount * 0.5);

    // сніг замість картинки при втраті сигналу
    col = mix(col, vec3(grain), clamp(noiseAmount * noiseAmount * 1.35 - 0.15, 0.0, 1.0));

    // сканлайни
    col *= 0.92 + 0.08 * sin(uv.y * uResolution.y * 3.14159);

    // віньєтка
    col *= 1.0 - 0.85 * r2 * r2;

    // нічна камера: чорно-біла з підйомом тіней
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum * 1.05 + 0.02), uMono);

    gl_FragColor = vec4(col, 1.0);
  }
`

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export class VideoFeed {
  private target: THREE.WebGLRenderTarget
  private quadScene = new THREE.Scene()
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private material: THREE.ShaderMaterial
  private time = 0

  constructor(
    private renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    monochrome = false,
  ) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
    })
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tSource: { value: this.target.texture },
        uTime: { value: 0 },
        uSignal: { value: 1 },
        uMono: { value: monochrome ? 1 : 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    })
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material))
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height)
    this.material.uniforms.uResolution.value.set(width, height)
  }

  /** Малює сцену в буфер, потім проганяє її через тракт на екран. */
  render(scene: THREE.Scene, camera: THREE.Camera, dt: number, signal: number): void {
    this.time += dt
    this.material.uniforms.uTime.value = this.time
    this.material.uniforms.uSignal.value = signal

    this.renderer.setRenderTarget(this.target)
    this.renderer.render(scene, camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.quadScene, this.quadCamera)
  }

  dispose(): void {
    this.target.dispose()
    this.material.dispose()
  }
}
