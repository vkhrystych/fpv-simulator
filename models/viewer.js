import * as THREE from 'three'

/**
 * Три однакові сцени поруч — інакше порівняння нечесне: варіант виграє світлом
 * чи ракурсом, а не формою. Тому камера, світло й земля спільні, різна лише модель.
 *
 * Світ z-up, як у грі: те, що тут стоїть правильно, стоїть правильно і в польоті.
 */
export class Viewer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x2a3128)
    this.scene.fog = new THREE.Fog(0x2a3128, 40, 260)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 800)
    this.camera.up.set(0, 0, 1)

    // Світла більше, ніж у грі: тут треба бачити форму, а не настрій.
    // Одне сонце давало силует-пляму — фронтальний підсвіт витягує скоси.
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1)
    sun.position.set(-30, 45, 60)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xbcd0e0, 0.8)
    fill.position.set(40, -30, 25)
    this.scene.add(fill)
    this.scene.add(new THREE.HemisphereLight(0xb9cbdc, 0x53523c, 1.1))

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0x5b6845 }),
    )
    this.scene.add(ground)

    // сітка з кроком 1 м — єдиний спосіб побачити, що танк справді 9.5 м
    const grid = new THREE.GridHelper(120, 120, 0x5c6b48, 0x3c4632)
    grid.rotation.x = Math.PI / 2
    grid.position.z = 0.02
    this.scene.add(grid)

    this.pivot = new THREE.Group()
    this.scene.add(this.pivot)
    this.model = null
  }

  setModel(group) {
    if (this.model) {
      this.pivot.remove(this.model)
      this.model.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
    }
    this.model = group
    this.pivot.add(group)
  }

  resize() {
    const c = this.renderer.domElement
    const w = c.clientWidth
    const h = c.clientHeight
    if (!w || !h) return
    if (c.width !== w * this.renderer.getPixelRatio() || c.height !== h * this.renderer.getPixelRatio()) {
      this.renderer.setSize(w, h, false)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  /**
   * Дистанцію рахує сама панель, а не спільний стан: панель вузька й висока,
   * тому кадр обмежує ГОРИЗОНТАЛЬНИЙ кут. Через вертикальний FOV танк
   * гарантовано вилазив за краї.
   *
   * @param cam {{yaw:number, pitch:number, zoom:number, radius:number, target:number, fixedDist:number|null}}
   */
  render(cam) {
    this.resize()
    const vHalf = (this.camera.fov * Math.PI) / 360
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect)
    const fit = cam.radius / Math.tan(Math.min(vHalf, hHalf))
    const dist = cam.fixedDist ?? fit * 1.15 * cam.zoom

    const cp = Math.cos(cam.pitch)
    this.camera.position.set(
      Math.sin(cam.yaw) * cp * dist,
      -Math.cos(cam.yaw) * cp * dist,
      Math.sin(cam.pitch) * dist + cam.target,
    )
    this.camera.lookAt(0, 0, cam.target)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.renderer.dispose()
  }
}
