# iSpec

iSpec is a browser-based app for searching and visualising spectral libraries. It runs entirely in the client using [Pyodide](https://pyodide.org/) and [hylite](https://github.com/hifexplo/hylite), so no backend is required once the app and library files are served.

**Live demo:** [https://samthiele.github.io/ispec/](https://samthiele.github.io/ispec/)

## What it does

iSpec lets you load one or more spectral libraries, search them by sample name or absorption features, and plot reflectance curves for query results and selected spectra. Libraries are stored as hylite Fourier archives (`.fda` files), which support fast feature-based search across large collections.

The main widgets are:

- **Library** — browse available libraries and load or unload them into the session
- **Query** — search loaded libraries; double-click results to add them to a selection list
- **Spectra** — interactive reflectance plot with band presets, zoom, hull correction, and toggles for query vs selected spectra
- **Console** — optional Python console for direct interaction with the loaded archive

Selected spectra can be given custom group labels and colours. 

Use **Share** in the header to copy a link that restores your query, libraries, selection, and display settings.

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

## Searching

In the Query widget, enter a search string and press **Search**. Examples:

- Sample name: `Quartz`, `Clay`
- Absorption wavelength (nm): `2200`
- Wavelength range: `2100-2300`
- Exclude a feature: `!1400`
- Search for peaks: prefix with `^`

**Confidence** sets the default wavelength uncertainty (± nm) used when matching features. Results are paginated; double-click a result to select it for plotting.

## Credits

Developed by [Sam Thiele](https://www.samthiele.science/) and the [Exploration Department](https://www.iexplo.space/) at the [Helmholtz Institute Freiberg for Resource Technology](https://www.hzdr.de/db/Cms?pOid=32948&pNid=2423&pLang=en).
