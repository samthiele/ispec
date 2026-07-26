# iSpec

iSpec is a browser-based app for searching and visualising spectral libraries. It runs entirely in the client using [Pyodide](https://pyodide.org/) and [hylite](https://github.com/hifexplo/hylite), so no backend is required once the app and library files are served.

**Main site:** [https://samthiele.github.io/ispec/](https://samthiele.github.io/ispec/)

Several spectral libraries can be loaded into iSpec (see the **Library** widget), though the following links can be used for thematic defaults:

- **Mineralogy** - [https://samthiele.github.io/ispec/#minerals](https://samthiele.github.io/ispec/#minerals)
- **Mineral mixtures** - [https://samthiele.github.io/ispec/#mixtures](https://samthiele.github.io/ispec/#mixtures)
- **Vegetation** - [https://samthiele.github.io/ispec/#vegetation](https://samthiele.github.io/ispec/#vegetation)
- **Environmental Remote Sensing** - [https://samthiele.github.io/ispec/#remotesensing](https://samthiele.github.io/ispec/#remotesensing)
- **Polymers and related compounds** - [https://samthiele.github.io/ispec/#polymers](https://samthiele.github.io/ispec/#polymers)

## Quickstart

iSpec lets you load one or more spectral libraries, search them by sample name or absorption features, compare spectra against a reference, and plot reflectance curves for query results and selected samples. Libraries are stored as [hylite](https://github.com/hifexplo/hylite) Fourier archives (`.fda` files), which support fast feature-based search across large collections.

Use **View Mode** in the header to switch layouts (**Tri**, **Bi**, or **Quad**) to match your screen size. **Share** copies a link that restores your query, libraries, selection, and display settings.

Use the drop down in the top-right of each view pane to select different widgets. Each of these are outlined below. 

### Library

Load or unload libraries into the session. Double-click a catalog entry to load (or unload) it, after which it should appear in the appropriate list. Only loaded libraries are searched and plotted. 

### Query

Enter a search string and press **Search** (enter). Clear the query using the cross button to reset. 

**Feature and name search**

Several different search options are possible: 

- Sample name: `Quartz`, `Clay` - find spectra matching all the provided (sub)strings
- Absorption wavelength (nm): `2200` - find spectra with absorptions at all specified wavelengths
- Wavelength range: `2100-2300` - match spectra with absorptions within the specified range
- Exclude a feature: `!1400` - exclude spectra with features at the specified location
- Search for peaks: prefix with `^` - combine with the above syntax to match or exclude peaks rather than absorption minima (e.g., in the LWIR).
- Combine queries with `|` - combine different queries using a logical OR (results interleaved by rank)
- SAM(2100-2300), FIT(...), CORR(...), SID(...) - find spectra that match the selected spectra across the specified wavelength range (see following section).

**N.B.** Confidence sets the default wavelength uncertainty (± nm) when matching absorption features. Results are paginated to limit the number of spectra loaded at any one time; use **Prev** / **Next** to move through pages. Increase RESULTS PER PAGE to see more spectra on each page. 

**Reference-spectrum search**:

Match the most recently selected spectra against the loaded spectral libraries using the chosen algorithm:

- `SAM` — spectral angle
- `FIT` — continuum-removed shape fit (Tetracorder-style)
- `CORR` — Pearson correlation
- `SID` — spectral information divergence

Note that these only use the spectral range currently visible in the SPECTRA viewer. Spectra that do not fully overlap this range will be ignored. 

**Results and selection**

Double-click (or long-press on mobile devices) a result to add it to the selection list. The **Selected** tab shows chosen spectra with editable group labels, colours, and mixture weights.

**Selected actions**

- **Upload** — add `.txt` / `.csv` virtual spectra (wavelength + reflectance columns). These can then be used for queries (e.g., spectral matching). 
- **Download** — export selected spectra as text files. Note that these are lossily compressed, so **will not exactly match the original library spectra**.
- **Mix** — build a weighted virtual mixture from selected spectra (≥ two with mix % > 0)
- **Match** — reference-spectrum search over the Spectra x-range.
- **Resample** — approximately resample to various satellite sensor resolutions.

### Spectra

Interactive reflectance plot for the current query page and/or selected spectra.

- Toggle **Query** and **Selected** traces
- **Hull** — continuum removal on the plotted range. Note that only spectra which entirely cover this range will be plotted.
- **Save** the plot as PNG or SVG

Hover a trace to highlight it across widgets.

### Chat

Gemini-powered assistant with context from your current search, selection, and spectral features. Ask questions about minerals, mixtures, or your loaded data. The assistant can propose new searches, mixtures or results — review and click **Apply** to update the app.

Note that this requires a Google Gemini API key, which can be easily setup using a free Google account, following the instructions shown on first use.

## Spectral libraries

Libraries are described by a catalog file, `public/libraries/index.json`, and fetched at runtime. Each entry points to a `.fda` file alongside the catalog:

```json
{
  "id": "usgs_minerals",
  "name": "USGS Spectral Library (V7) Chapter M: Minerals",
  "source": "https://www.usgs.gov/data/usgs-spectral-library-version-7-data",
  "description": "Mineral spectra from the USGS Spectroscopy Lab.",
  "file": "usgs_minerals.fda",
  "default": true
}
```

New (public / open-access) spectral libraries can be quite easily added on request.

## Issues and contributions

If you have issues, ideas or would like to contribute then please do get in touch via [Github Issues](https://github.com/samthiele/ispec/issues) or the [Discussions](https://github.com/samthiele/ispec/discussions) page.

## Credits

Developed by [Sam Thiele](https://www.samthiele.science/) and the [Exploration Department](https://www.iexplo.space/) at the [Helmholtz Institute Freiberg for Resource Technology](https://www.hzdr.de/db/Cms?pOid=32948&pNid=2423&pLang=en).
