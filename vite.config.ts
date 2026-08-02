import { defineConfig } from 'vite'

/**
 * Збірка йде в docs/, а не в dist/, і комітиться в репозиторій.
 * Так GitHub Pages роздає гру як звичайну статику з гілки main —
 * без Actions, без окремої гілки gh-pages, без CI взагалі.
 *
 * base мусить збігатися з назвою репозиторію: project-сторінки Pages
 * живуть за адресою /<repo>/, і з коренем «/» усі шляхи до асетів
 * ведуть у нікуди.
 *
 * .nojekyll лежить у public/, а не в docs/: emptyOutDir чистить docs/
 * при кожній збірці, тому покладений туди руками файл жив рівно до
 * наступного `npm run build`. З public/ Vite копіює його щоразу сам.
 */
export default defineConfig({
  base: '/fpv-simulator/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // 520 КБ — це three.js; ділити його на чанки нема сенсу,
    // сторінка все одно не працює без нього
    chunkSizeWarningLimit: 700,
  },
})
