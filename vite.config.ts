import { defineConfig } from 'vite'

/**
 * Збірка йде в docs/, а не в dist/, і комітиться в репозиторій.
 * Так GitHub Pages роздає гру як звичайну статику з гілки main —
 * без Actions, без окремої гілки gh-pages, без CI взагалі.
 *
 * base = './' — ВІДНОСНІ шляхи до асетів. Абсолютний base (навіть правильний
 * '/fpv-simulator/') прив'язує збірку до однієї конкретної адреси: варто Pages
 * почати роздавати з іншої папки — і всі асети дають 404. З відносним base
 * сторінка працює за будь-яким шляхом: /fpv-simulator/, /fpv-simulator/docs/,
 * власний домен, локальний файл. Одна змінна менше, яку можна зламати.
 *
 * .nojekyll лежить у public/, а не в docs/: emptyOutDir чистить docs/
 * при кожній збірці, тому покладений туди руками файл жив рівно до
 * наступного `npm run build`. З public/ Vite копіює його щоразу сам.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // 520 КБ — це three.js; ділити його на чанки нема сенсу,
    // сторінка все одно не працює без нього
    chunkSizeWarningLimit: 700,
  },
})
