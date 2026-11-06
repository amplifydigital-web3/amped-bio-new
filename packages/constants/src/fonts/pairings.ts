// Theme Engine v2 fonts (spec 3.8): 24 curated name plus body pairings for
// the Pairings shelf. Every family must exist in catalog.json; the catalog
// test checks it. Picking a pairing sets both the Name font and the Body font.

export interface FontPairing {
  name: string;
  body: string;
  /** One or two words for the tile's second line */
  mood: string;
}

export const FONT_PAIRINGS: readonly FontPairing[] = [
  { name: "Fraunces", body: "Figtree", mood: "Warm editorial" },
  { name: "Playfair Display", body: "Source Sans 3", mood: "Classic editorial" },
  { name: "DM Serif Display", body: "DM Sans", mood: "Clean contrast" },
  { name: "Instrument Serif", body: "Inter Tight", mood: "Gallery" },
  { name: "Cormorant Garamond", body: "Proza Libre", mood: "Elegant" },
  { name: "Libre Baskerville", body: "Karla", mood: "Bookish" },
  { name: "EB Garamond", body: "Mulish", mood: "Literary" },
  { name: "Lora", body: "Work Sans", mood: "Friendly serif" },
  { name: "Space Grotesk", body: "Inter", mood: "Tech" },
  { name: "Bricolage Grotesque", body: "Inter", mood: "Studio" },
  { name: "Syne", body: "Manrope", mood: "Art school" },
  { name: "Unbounded", body: "Outfit", mood: "Wide and bold" },
  { name: "Archivo Black", body: "Archivo", mood: "Poster" },
  { name: "Bebas Neue", body: "Montserrat", mood: "Headline" },
  { name: "Anton", body: "Roboto", mood: "Sports" },
  { name: "Oswald", body: "Open Sans", mood: "Condensed" },
  { name: "Abril Fatface", body: "Lato", mood: "Fashion" },
  { name: "Righteous", body: "Poppins", mood: "Retro" },
  { name: "Pacifico", body: "Quicksand", mood: "Beach" },
  { name: "Caveat", body: "Nunito", mood: "Handwritten" },
  { name: "Dancing Script", body: "Raleway", mood: "Script" },
  { name: "Permanent Marker", body: "Rubik", mood: "Street" },
  { name: "Space Mono", body: "Space Grotesk", mood: "Terminal" },
  { name: "JetBrains Mono", body: "IBM Plex Sans", mood: "Developer" },
];
