export const scrolltoshow = (): void => {
  const els = Array.from(document.getElementsByClassName("scrollts"))
  if (IntersectionObserver !== undefined) {
    const observer = new IntersectionObserver((entries, o) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("show")
          o.unobserve(entry.target)
        }
      }
    }, {
        rootMargin: "-30% 0px",
        threshold: 0
      })
    const observerNomargin = new IntersectionObserver((entries, o) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("show")
          o.unobserve(entry.target)
        }
      }
    }, {
        rootMargin: "0px",
        threshold: 0
      })
    for (const el of els) {
      if (el.classList.contains("scrollts-nomargin")) observerNomargin.observe(el)
      else observer.observe(el)
    }
  } else {
    console.log("v")
    for (const el of els) {
      el.classList.add("show")
    }
  }
}
