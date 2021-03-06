/* eslint-disable no-empty-pattern */
// mixin検出用(ここで指定されていなかったら事前に挿入する)
// falib.jsも更新すること

const {
  faGithub,
  faTwitter,
  faYoutube
} = require("@fortawesome/free-brands-svg-icons")

const {
  faBars,
  faClock,
  faExternalLinkAlt,
  faHome,
  faFolderOpen,
  faTags
} = require("@fortawesome/free-solid-svg-icons")

module.exports = {
  icons: [
    faGithub,
    faTwitter,
    faYoutube,

    faBars,
    faClock,
    faExternalLinkAlt,
    faHome,
    faFolderOpen,
    faTags
  ]
}
