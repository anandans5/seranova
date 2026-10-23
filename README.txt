SERANOVA INFRA WEBSITE — ORGANIZED SOURCE

PROJECT STRUCTURE
- HTML pages stay at the project root for direct static hosting and Vercel rewrites.
- css/ contains site stylesheets.
- js/ contains page behaviour, 3D effects and logo animation scripts.
- assets/brand/ contains the text-free Seranova emblem and all favicon variants.
- assets/brands/ contains supplier logo artwork.
- assets/gallery/ contains construction and design images.
- favicon.ico at the root is a compatibility copy of the same emblem favicon.
- robots.txt, sitemap.xml and vercel.json stay at the root.

BRANDING
The header now uses assets/brand/favicon-mark-512.png — the same text-free emblem artwork used by the favicon, rather than the former text-bearing favicon.jpeg. The animated on-page emblem uses the transparent assets/brand/seranova-mark.png artwork. The company name beside the header emblem remains normal HTML text for readability and accessibility.

DEPLOYMENT
1. Extract this ZIP. The complete project is inside Seranova_Infra_Website_Code/.
2. Upload/commit the CONTENTS of that folder to the root of the existing GitHub repository (so index.html, vercel.json, css/, js/ and assets/ are at repository root).
3. Push to the branch connected to Vercel; no build command is required for this static site.
4. Check homepage, internal pages, header logo, browser favicon, supplier showcase and gallery after deployment.

No company copy, project information, navigation targets, form content or existing page sections were intentionally changed as part of this organization pass.
