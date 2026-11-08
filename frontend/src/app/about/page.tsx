import AboutView from "./about-view"
import { pageMetadata } from "@/lib/seo"
import { aboutCopy } from "@/lib/about"

export const metadata = pageMetadata(aboutCopy.title, aboutCopy.description, "/about")

export default function Page() {
  return <AboutView />
}
