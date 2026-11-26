import ContactView from "./contact-view"
import { pageMetadata } from "@/lib/seo"
import { contactCopy } from "@/lib/contact"

export const metadata = pageMetadata(contactCopy.title, contactCopy.description, "/contact")

export default function Page() {
  return <ContactView />
}
