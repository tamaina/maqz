/* eslint-disable no-useless-escape */
// npm require
const gulp = require("gulp")
const extend = require("extend")
const fs = require("fs")
const { promisify } = require("util")
const path = require("path")
const del = require("del")
const minimist = require("minimist")
const pump = require("pump")
// const request = require("request")
const pug = require("pug")
const glog = require("fancy-log")
const colors = require("colors")
const readyaml = require("js-yaml").safeLoad
const mkdirp = require("mkdirp")
const webpackStream = require("webpack-stream")
const webpack = require("webpack")
const Sitemap = require("sitemap")

const postcssSorting = require("postcss-sorting")
const autoprefixer = require("autoprefixer")
const cssMqpacker = require("css-mqpacker")
const cssnano = require("cssnano")

const sizeOf = require("image-size")
const cheerio = require("cheerio")

const url = require("url")

const { dom, library, icon } = require("@fortawesome/fontawesome-svg-core")

library.add(
  require("@fortawesome/free-solid-svg-icons").fas,
  require("@fortawesome/free-regular-svg-icons").far,
  require("@fortawesome/free-brands-svg-icons").fab
)

const $ = require("gulp-load-plugins")()

const donloadTemp = require("./scripts/downloadTemp")
const makeHtml = require("./scripts/makeHtml")
const regheadings = require("./scripts/regheadings")

const makeRss = require("./scripts/builder/registerer/rss")

// const exec = require("child_process").exec
// const join = path.join
// const moment = require("moment")
// const numeral = require("numeral")
// const inquirer = require("inquirer")

// promisify

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)

// arg
const argv = minimist(process.argv.slice(2))

// debug
const DEBUG = !!(argv._.indexOf("debug") > -1 || argv.debug)

function existFile(file) {
  try {
    fs.statSync(file)
    return true
  } catch (e) {
    if (e.code === "ENOENT") return false
    return null
  }
}

function loadyaml(filepath) {
  return readyaml(fs.readFileSync(filepath))
}

// グローバル気味変数
const packageJson = require("./package.json")

const messages = loadyaml("./.config/messages.yml")
let site = extend(
  true,
  loadyaml("./.config/default.yml"),
  loadyaml("./.config/images.yml")
)

if (argv._.some((e) => e === "local-server")) site = extend(this, site, readyaml(fs.readFileSync("./.config/debug-override.yml")))

const keys = (() => {
  if (existFile("./.config/keys.yml")) {
    try {
      return loadyaml("./.config/keys.yml")
    } catch (e) {
      glog("./.config/keys.yml is wrong.")
      throw Error(e)
    }
  // eslint-disable-next-line brace-style
  } /* else if (A_KEY_YOU_WANT_TO_READ_FROM_ENV in provess.env) {
        return {
            service: {
                key: process.env.A_KEY_YOU_WANT_TO_READ_FROM_ENV,
            }
        }
    } */ else { return {} }
})()

const tempDir = "dist/cache/" // 末尾のスラッシュ必要

const urlPrefix = `${site.url.scheme}://${site.url.host}${site.url.path}`
glog(`Site url is "${urlPrefix}"`)

const src = {
  everypug: ["theme/pug/**/*.pug", "./.temp/**/*.pug"],
  json: ["config/**/*.json"],
  js: ["theme/js/**/*.js"],
  styl_all: ["theme/styl/**/*.styl"],
  static: ["theme/static/**"],
  files: ["files/**/*"],
  filesPrebuilt: ["filesPrebuilt/**/*"],
  everystyl: ["theme/styl/**/*.styl"],
  pages: path.join(site.pages_src.path, site.pages_src.src)
}

const dests = {
  root: "./dist/docs",
  everything: "./dist/docs/**",
  info: "./dist/docs/info.json"
}

let manifest = {}
let pages = []
let base
let pugfilters

const getBase = require("./scripts/builder/registerer/base")
const getPages = require("./scripts/builder/registerer/pages")
const getManifest = require("./scripts/builder/registerer/manifest")

gulp.task("register", async (cb) => {
  const rf = promisify(fs.readFile)
  manifest = {}
  pages = []
  // eslint-disable-next-line global-require
  pugfilters = require("./pugfilters.js")
  manifest = getManifest(site)
  const [npages, nscript, nmixin, baseP] = await Promise.all([
    getPages(site, src, urlPrefix),
    rf("theme/pug/includes/_script.pug", { encoding: "utf8" }),
    rf("theme/pug/includes/_mixins.pug", { encoding: "utf8" }),
    getBase(site, keys, tempDir)
  ])
  pages = npages
  base = extend(
    true,
    baseP,
    {
      update: (new Date()),
      site,
      keys,
      package: packageJson,
      pages,
      manifest,
      messages,
      require,
      themePug: {
        script: nscript,
        mixin: nmixin
      },
      urlPrefix,
      DEBUG
    }
  )

  cb()
})

gulp.task("config", () => {
  let resultObj = { options: "" }
  resultObj.timestamp = (new Date()).toJSON()
  resultObj = extend(true, resultObj, { pages })
  mkdirp.sync(path.parse(dests.info).dir)
  return writeFile(dests.info, JSON.stringify(resultObj))
    .then(
      () => { glog(colors.green("✔ info.json")) },
      (err) => { glog(colors.red("✖ info.json")); glog(err) }
    )
})

const cssDestpath = `${dests.root}/assets/styles`

gulp.task("css", (cb) => {
  pump([
    gulp.src("theme/styl/main.sass"),
    $.sass({ sourceMap: true, outputStyle: "compressed" }),
    $.header(dom.css()),
    $.postcss([
      postcssSorting(),
      autoprefixer(),
      cssMqpacker(),
      cssnano()
    ]),
    $.rename("main.css"),
    gulp.dest(cssDestpath)
  ], async (e) => {
    if (e) glog(colors.red(`Error(css)\n${e}`))
    else glog(colors.green("✔ assets/styles/main.css"))
    cb()
  })
})

gulp.task("js", (cb) => {
  const wpackconf = {
    entry: {
      main: "./theme/js/main.ts",
      sw: "./theme/js/sw.ts"
    },
    output: {
      filename: "[name].js",
      publicPath: `${site.url.path}/assets/scripts/`
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".sass", ".scss", ".css"],
      modules: ["node_modules"]
    },
    module: {
      rules: [
        {
          test: /\.s[ac]ss$/i,
          use: [
            { loader: "style-loader", options: { injectType: "lazyStyleTag" } },
            "css-loader",
            "sass-loader"
          ]
        },
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            appendTsSuffixTo: [/\.s[ac]ss$/]
          }
        }
      ]
    },
    mode: "production"
  }

  webpackStream(wpackconf, webpack)
    .pipe(gulp.dest(`${dests.root}/assets/scripts`))
    .on("end", () => {
      glog(colors.green("✔ scripts"))
      cb()
    })
    .on("error", (err) => {
      cb(err)
    })
})

function searchSidebar(pathe) {
  let searchin
  if (pathe.dir === "") searchin = "pages/sidebar.pug"
  else searchin = `${pathe.dir}/sidebar.pug`
  if (existFile(searchin) || searchin === "pages/sidebar.pug") {
    return searchin
  }
  const uppath = path.parse(pathe.dir)
  searchSidebar(uppath)
  return null
}

// eslint-disable-next-line no-shadow
async function toamp(htm) {
  // eslint-disable-next-line no-shadow
  const $ = cheerio.load(htm, { decodeEntities: false })
  const promises = []
  $("picture").each((i, el) => {
    promises.push(async () => {
      const img = $(el).children("img[src]").first()
      const webp = $(el).children("source[type='image/webp']").first()
      // eslint-disable-next-line no-shadow
      const src = img.attr("src")
      const srcset = webp.attr("srcset")
      const alt = img.attr("alt")
      const title = img.attr("title")
      const id = img.attr("id")
      let width = img.attr("width")
      let height = img.attr("height")
      if ((width === undefined || height === undefined) && src.startsWith(`${urlPrefix}/files/`)) {
        const dims = sizeOf(`.${src.slice(urlPrefix.length)}`)
        // eslint-disable-next-line prefer-destructuring
        width = dims.width
        // eslint-disable-next-line prefer-destructuring
        height = dims.height
      } else if ((width === undefined || height === undefined) && (src.startsWith("http") || src.startsWith("//"))) {
        const Url = url.parse(src)
        const filename = `${Url.pathname.slice(1).replace(/\//g, "-")}`.slice(-36)
        const temppath = `${tempDir}amp/${Url.hostname}/`
        mkdirp.sync(temppath)
        const v = await donloadTemp(filename, src, temppath, true)
        glog(v)
        if (!v || !existFile(`${temppath}${filename}.${v.ext}`)) {
          glog(`${messages.amp.invalid_imageUrl}:\n${src}`)
          return
        }
        const dims = sizeOf(`${temppath}${filename}.${v.ext}`)
        // eslint-disable-next-line prefer-destructuring
        width = dims.width
        // eslint-disable-next-line prefer-destructuring
        height = dims.height
      } else {
        glog(`${messages.amp.invalid_imageUrl}:\n${src}`)
        return
      }
      $(el).replaceWith(`<amp-img src="${src}" srcset="${srcset}" alt="${alt}" title="${title}" id="${id}" width="${width}" height="${height}" layout="responsive"></amp-image>`)
    })
  })
  if (promises.length > 0) await Promise.all(promises)
  $("i").each((i, el) => {
    $(el).replaceWith(icon(
      { iconName: $(el).attr("data-fa-icon-name"), prefix: $(el).attr("data-fa-prefix") },
      JSON.parse($(el).attr("data-fa-option").replace(/'/g, "\""))
    ).html[0])
  })

  return $.html()
}

gulp.task("pug", async () => {
  const streams = []
  const puglocalses = []
  const sidebarPaths = []
  const sidebarReadPromises = []

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]
    const puglocals = extend(
      true,
      {
        page,
        filters: pugfilters
      },
      base
    )
    if (site.sidebar) {
      const sidebarpath = searchSidebar(page.meta.src) || "pages/sidebar.pug"
      puglocals.sidebarpath = sidebarpath
      if (!sidebarPaths.some((e) => e === sidebarpath)) {
        sidebarPaths.push(sidebarpath)
        sidebarReadPromises.push(
          readFile(sidebarpath, "utf-8")
            .catch((e) => {
              glog(colors.red(`Sidebar Reading Failed at ${sidebarpath}`))
              throw Error(e)
            })
        )
      }
    }
    puglocalses.push(puglocals)
  }

  const sidebarReadsArr = await Promise.all(sidebarReadPromises)
  const sidebarReads = {}
  if (site.sidebar && sidebarPaths.length > 0) {
    for (let n = 0; n < sidebarReadsArr.length; n += 1) {
      sidebarReads[sidebarPaths[n]] = sidebarReadsArr[n]
    }
  }

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]
    const puglocals = puglocalses[i]

    if (site.sidebar && sidebarPaths.length > 0) {
      puglocals.sidebarHtml = pug.render(`${base.themePug.script}\n${base.themePug.mixin}\n${sidebarReads[puglocals.sidebarpath]}`, puglocals)
    }

    const { layout } = page.attributes
    let template = ""
    let amptemplate = ""
    if (existFile(`theme/pug/templates/${layout}.pug`)) template += `theme/pug/templates/${layout}.pug`
    else if (existFile(`theme/pug/templates/${site.default.template}.pug`)) template += `theme/pug/templates/${site.default.template}.pug`
    else throw Error("default.pugが見つかりませんでした。")

    const mainHtml = makeHtml(page, puglocals, urlPrefix)

    puglocals.mainHtml = mainHtml
    page.mainHtml = mainHtml
    puglocals.headings = regheadings(page.mainHtml)

    streams.push(
      new Promise((res, rej) => {
        gulp.src(template)
          .pipe($.pug({ locals: puglocals }))
          .pipe($.rename(`${page.meta.permalink}index.html`))
          .pipe(gulp.dest(dests.root))
          .on("end", () => {
            // glog(colors.green(`✔ ${page.meta.permalink}`))
            res()
          })
          .on("error", (err) => {
            glog(colors.red(`✖ ${page.meta.permalink}`))
            rej(err)
          })
      })
    )
    /*
     *                            AMP処理部
     *                                                                  */

    if (page.attributes.amp) {
      if (existFile(`theme/pug/templates/amp_${layout}.pug`)) amptemplate += `theme/pug/templates/amp_${layout}.pug`
      else if (existFile(`theme/pug/templates/amp_${site.default.template}.pug`)) amptemplate += `theme/pug/templates/amp_${site.default.template}.pug`
      else throw Error("amp_default.pugが見つかりませんでした。")
      streams.push(
        toamp(puglocals.mainHtml, base)
          .then(
            (ampHtml) => new Promise((res, rej) => {
              const newoptions = extend(
                true,
                puglocals,
                { isAmp: true, mainHtml: ampHtml }
              )
              gulp.src(amptemplate)
                .pipe($.pug({ locals: newoptions }))
                .pipe($.rename(`${page.meta.permalink}amp.html`))
                .pipe(gulp.dest(dests.root))
                .on("end", () => {
                  // glog(colors.green(`✔ ${page.meta.permalink}amp.html`))
                  res()
                })
                .on("error", (err) => {
                  glog(colors.red(`✖ ${page.meta.permalink} (amp)`))
                  rej(err)
                })
            }), (e) => {
              glog(colors.red(`Amp Processing Failed at ${page.meta.permalink}`))
              throw Error(e)
            }
          )
      )
    }
  }

  await Promise.all(streams)
  glog(colors.green("✔ all html produced"))
  return null
})

gulp.task("copy-docs", (cb) => {
  pump([
    gulp.src("dist/docs/**/*", { dot: true }),
    gulp.dest("./docs")
  ], cb)
})
gulp.task("copy-theme-static", (cb) => {
  pump([
    gulp.src("theme/static/**/*", { dot: true }),
    gulp.dest(dests.root)
  ], cb)
})
gulp.task("copy-prebuildFiles", (cb) => {
  pump([
    gulp.src("dist/files/**/*", { dot: true }),
    gulp.dest(`${dests.root}/files`)
  ], cb)
})
gulp.task("copy-files", (cb) => {
  pump([
    gulp.src(src.files, { dot: true }),
    gulp.dest(`${dests.root}/files`)
  ], cb)
})
gulp.task("copy-f404", (cb) => {
  pump([
    gulp.src("dist/docs/404/index.html", { dot: true }),
    $.rename("404.html"),
    gulp.dest("./docs")
  ], cb)
})

if (!Array.isArray) {
  Array.isArray = (arg) => Object.prototype.toString.call(arg) === "[object Array]"
}

const imagesAllFalse = {
  optipng: false,
  pngquant: false,
  zopflipng: false,
  jpegRecompress: false,
  mozjpeg: false,
  guetzli: false,
  gifsicle: false,
  svgo: false
}
function imagesBase() {
  return site.images.files.all.image ? extend(
    true,
    imagesAllFalse,
    site.images.files.all.image
  ) : imagesAllFalse
}

const gmAutoOrient = $.gm(
  (gmfile) => gmfile.autoOrient(),
  {
    imageMagick: site.imageMagick
  }
)

gulp.task("image-prebuildFiles", () => {
  const raster = "files/**/*.{png,jpg,jpeg}"
  const gif = "files/**/*.gif"
  const svg = "files/**/*.svg"
  const { sizes } = site.images.files
  const streamsrc = gulp.src(raster).pipe(gmAutoOrient)
  const streams = []
  for (let i = 0; i < sizes.length; i += 1) {
    streams.push(
      // eslint-disable-next-line no-loop-func
      new Promise((res, rej) => {
        streamsrc
          .pipe($.imageResize(
            sizes[i].resize ? extend(
              true,
              { imageMagick: site.imageMagick },
              sizes[i].resize
            ) : {}
          ))
          .pipe($.image(sizes[i].image ? extend(
            true,
            imagesBase(),
            sizes[i].image
          ) : imagesAllFalse))
          .pipe($.rename(sizes[i].rename || {}))
          .pipe(gulp.dest("dist/files"))
          .on("end", res)
          .on("error", rej)
      })
    )
  }
  streams.push(
    new Promise((res, rej) => {
      gulp.src(gif)
        .pipe($.image(extend(true, imagesBase(), {
          gifsicle: true
        })))
        .pipe(gulp.dest("dist/files"))
        .on("end", res)
        .on("error", rej)
    })
  )
  streams.push(
    new Promise((res, rej) => {
      gulp.src(svg)
        .pipe($.inkscape({ args: ["-T"] }))
        .pipe($.svgmin())
        .pipe(gulp.dest("dist/files"))
        .on("end", res)
        .on("error", rej)
    })
  )
  return Promise.all(streams)
})

gulp.task("image", () => {
  if (!argv.i) throw Error("ファイル/フォルダ名が指定されていません。 -i <path>を付けて指定してください。")
  const parsed = path.parse(argv.i)
  if (parsed.length <= 0) throw Error("指定されたパスにファイルは見つかりませんでした。")
  const { sizes } = site.images.files
  const streams = []
  const date = new Date()
  let gif; let svg; let others
  const dirname = `${date.getFullYear()}/${(`0${date.getMonth() + 1}`).slice(-2)}`
  if (parsed.ext === "") {
    glog(`image will be saved like as "files/images/imports/${dirname}/filename.ext"`)
    gif = gulp.src(`${argv.i}/**/*.gif`)
    svg = gulp.src(`${argv.i}/**/*.svg`)
    others = gulp.src(`${argv.i}/**/*.{png,jpg,jpeg}`)
  } else if (parsed.ext === ".svg") {
    glog(`image will be saved like as "files/images/imports/${dirname}/${parsed.name}${parsed.ext}"`)
    svg = gulp.src(argv.i)
  } else if (parsed.ext === ".gif") {
    glog(`image will be saved like as "files/images/imports/${dirname}/${parsed.name}${parsed.ext}"`)
    gif = gulp.src(argv.i)
  } else {
    glog(`image will be saved like as "files/images/imports/${dirname}/${parsed.name}${parsed.ext}"`)
    others = gulp.src(argv.i).pipe(gmAutoOrient)
  }
  if (gif) {
    streams.push(
      new Promise((res, rej) => {
        gif
          .pipe($.image(extend(true, imagesBase(), {
            gifsicle: true
          })))
          .pipe($.rename({ dirname } || {}))
          .pipe(gulp.dest("dist/files/images/imports"))
          .on("end", res)
          .on("error", rej)
      })
    )
    streams.push(
      new Promise((res, rej) => {
        gif
          .pipe($.rename({ dirname } || {}))
          .pipe(gulp.dest("files/images/imports"))
          .on("end", res)
          .on("error", rej)
      })
    )
  }
  if (svg) {
    streams.push(
      new Promise((res, rej) => {
        svg
          .pipe($.inkscape({ args: ["-T"] }))
          .pipe($.svgmin())
          .pipe($.rename({ dirname } || {}))
          .pipe(gulp.dest("dist/files/images/imports"))
          .on("end", res)
          .on("error", rej)
      })
    )
    streams.push(
      new Promise((res, rej) => {
        svg
          .pipe($.rename({ dirname } || {}))
          .pipe(gulp.dest("files/images/imports"))
          .on("end", res)
          .on("error", rej)
      })
    )
  }
  if (others) {
    for (let i = 0; i < sizes.length; i += 1) {
      streams.push(
        new Promise((res, rej) => {
          others
            .pipe($.imageResize(sizes[i].resize ? extend(
              true,
              { imageMagick: site.imageMagick },
              sizes[i].resize
            ) : {}))
            .pipe($.image(sizes[i].image ? extend(
              true,
              imagesBase(),
              sizes[i].image
            ) : imagesAllFalse))
            .pipe($.rename(sizes[i].rename || {}))
            .pipe($.rename({ dirname } || {}))
            .pipe(gulp.dest("dist/files/images/imports"))
            .on("end", res)
            .on("error", rej)
        })
      )
    }
    streams.push(
      new Promise((res, rej) => {
        others
          .pipe($.rename({ dirname } || {}))
          .pipe(gulp.dest("files/images/imports"))
          .on("end", res)
          .on("error", rej)
      })
    )
  }

  return Promise.all(streams)
})

gulp.task("clean-docs", (cb) => { del(["docs/**/*", "!docs/.git"], { dot: true }).then(cb()) })
gulp.task("clean-dist-docs", (cb) => { del("dist/docs/**/*", { dot: true }).then(cb()) })
gulp.task("clean-dist-files", (cb) => { del("dist/files/**/*", { dot: true }).then(cb()) })

gulp.task("make-sw", (cb) => {
  if (!site.sw) {
    cb()
    return null
  }
  const destName = "service_worker"
  let res = ""
  res = `/* workbox ${base.update.toJSON()} */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

self.addEventListener("install", function(event) {
  self.skipWaiting();
  self.clients.claim();
})

workbox.routing.registerRoute(
    /.*\.(?:${site.sw})/,
    workbox.strategies.staleWhileRevalidate({
        cacheName: "assets-cache",
    })
);
`
  const offline = pages.some((e) => e.meta.permalink === "/offline/")
  if (offline) {
    res += `workbox.precaching.precacheAndRoute([
    {
        url: "/offline/",
        revision: "${base.update.getTime()}",
    }
]);
self.addEventListener("fetch", function(event) {
    event.respondWith(
        caches.match(event.request)
        .then(function(response) {
            return response || fetch(event.request);
        })
        .catch(function() {
            return caches.match("/offline/");
        })
    );
});
`
  } /*
        if(site.ga){
                res +=
`workbox.googleAnalytics.initialize({
    parameterOverrides: {
        cd1: "offline",
    },
});
`
        } */
  fs.writeFile(`${dests.root}/${destName}.js`, res, () => {
    glog(colors.green(`✔ ${destName}.js`))
    cb()
  })
  return null
})

gulp.task("make-manifest", () => writeFile("dist/docs/manifest.json", JSON.stringify(manifest))
  .then(
    () => { glog(colors.green("✔ manifest.json")) },
    (err) => { glog(colors.red("✖ manifest.json")); glog(err) }
  ))

gulp.task("make-rss", (cb) => {
  if (site.rss) {
    const feed = makeRss(base, pages, site.rss.root, site.rss.template)
    return Promise.all([
      writeFile("dist/docs/feed.rss", feed.rss2())
        .then(
          () => { glog(colors.green("✔ feed.rss")) },
          (err) => { glog(colors.red("✖ feed.rss")); glog(err) }
        ),
      writeFile("dist/docs/feed.json", feed.json1())
        .then(
          () => { glog(colors.green("✔ feed.json")) },
          (err) => { glog(colors.red("✖ feed.json")); glog(err) }
        ),
      writeFile("dist/docs/feed.atom", feed.atom1())
        .then(
          () => { glog(colors.green("✔ feed.atom")) },
          (err) => { glog(colors.red("✖ feed.atom")); glog(err) }
        )
    ])
  }
  return cb()
})

const browserconfigXml = () => `<?xml version="1.0" encoding="utf-8"?>
    <browserconfig>
      <msapplication>
        <tile>
          <square70x70logo src="${site.url.path}${site.mstiles.s70x70.path}"/>
          <square144x144logo src="${site.url.path}${site.mstiles.s144x144.path}"/>
          <square150x150logo src="${site.url.path}${site.mstiles.s150x150.path}"/>
          <square310x310logo src="${site.url.path}${site.mstiles.s310x310.path}"/>
          <wide310x150logo src="${site.url.path}${site.mstiles.w310x150.path}"/>
          <TileColor>${site.theme_color.secondary}</TileColor>
        </tile>
      </msapplication>
    </browserconfig>`

gulp.task("make-browserconfig", (cb) => {
  fs.writeFile("dist/docs/browserconfig.xml", browserconfigXml, () => {
    glog(colors.green("✔ browserconfig.xml")); cb()
  })
})

gulp.task("make-sitemap", (cb) => {
  const urls = pages.map((page) => ({
    url: page.meta.permalink
  }))

  const sitemap = Sitemap.createSitemap({
    hostname: urlPrefix,
    urls
  })

  fs.writeFile("dist/docs/sitemap.xml", sitemap.toString(), () => {
    glog(colors.green("✔ sitemap.xml")); cb()
  })
})

function wait4(cb, psec) {
  let sec = psec
  let interval = null
  process.stdout.write(colors.green(` ${sec} ██████    \r`))
  function waiti() {
    sec -= 1
    if (sec < 0 && interval != null) {
      process.stdout.write("\r")
      cb()
      clearInterval(interval)
    } else if (sec === 0) process.stdout.write(colors.red(`\r ${sec}              \r`))
    else if (sec === 1) process.stdout.write(colors.red(`\r ${sec}  █            \r`))
    else if (sec === 2) process.stdout.write(colors.red(`\r ${sec}  ██          \r`))
    else if (sec === 3) process.stdout.write(colors.red(`\r ${sec}  ███        \r`))
    else if (sec === 4) process.stdout.write(colors.yellow(`\r ${sec}  ████      \r`))
    else if (sec === 5) process.stdout.write(colors.yellow(`\r ${sec}  █████    \r`))
    else process.stdout.write(colors.green(`\r ${sec}  ██████    `))
  }
  interval = setInterval(waiti, 1000)
}

gulp.task("wait-5sec", (cb) => {
  wait4(cb, 5)
})

gulp.task("wait-10sec", (cb) => {
  wait4(cb, 10)
})

gulp.task("last",
  gulp.series(
    "clean-docs",
    "copy-f404",
    "copy-docs",
    "clean-dist-docs",
    (cb) => { cb() }
  ))

gulp.task("copy-publish",
  gulp.series(
    "copy-files",
    "copy-prebuildFiles",
    "copy-theme-static",
    (cb) => { cb() }
  ))
gulp.task("make-subfiles",
  gulp.series(
    gulp.parallel(
      "make-manifest",
      "make-rss",
      "make-browserconfig",
      "make-sitemap"
    ),
    (cb) => { cb() }
  ))

gulp.task("core",
  gulp.series(
    gulp.parallel(
      "config",
      "css",
      "pug",
      "js"
    ),
    gulp.parallel("copy-publish", "make-subfiles"),
    "make-sw", "last",
    (cb) => { cb() }
  ))

gulp.task("default",
  gulp.series(
    "register",
    "core",
    (cb) => { cb() }
  ))

gulp.task("pages",
  gulp.series(
    "register",
    gulp.parallel("config", "pug"),
    gulp.parallel("copy-prebuildFiles", "make-subfiles"),
    "copy-f404",
    "copy-docs",
    "clean-dist-docs",
    (cb) => { cb() }
  ))

gulp.task("prebuild-files",
  gulp.series(
    "clean-dist-files",
    "image-prebuildFiles",
    (cb) => { cb() }
  ))

gulp.task("core-with-pf",
  gulp.series(
    "prebuild-files",
    gulp.parallel("css", "js", "pug"),
    gulp.parallel("copy-publish", "make-subfiles"),
    "make-sw", "last",
    (cb) => { cb() }
  ))

gulp.task("travis_ci",
  gulp.series(
    "register",
    "prebuild-files",
    "default",
    (cb) => { cb() }
  ))

gulp.task("watcher",
  gulp.series(
    "wait-5sec", "register", "config",
    (cb) => { cb() }
  ))

gulp.task("watch", () => {
  gulp.watch(["theme/**/*", `!${tempDir}**/*`, "pages/**/*", "./.config/**/*", "./scripts/**/*"], gulp.series("watcher", "server", (cb) => { cb() }))
  gulp.watch(["files/**/*", "./.config/**/*"], gulp.series("watcher", (cb) => { cb() }))
})

gulp.task("connect", () => {
  $.connect.server({
    port: site.url.host.split(":")[1],
    root: "docs",
    livereload: true
  })
})

gulp.task("server",
  gulp.series(
    "register",
    "core",
    (cb) => { cb() }
  ))

gulp.task("local-server",
  gulp.series(
    "register",
    "core",
    gulp.parallel("connect", "watch"),
    (cb) => { cb() }
  ))
