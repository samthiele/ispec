export const HYLITE_WHEEL_URL =
  'https://hifexplo.github.io/hylite/wheels/hylite-1.4.dev0-py3-none-any.whl'

export const DEFAULT_LIBRARY_ID = 'usgs_minerals'

export const PYTHON_PACKAGES = [
  { spec: 'numpy', deps: true, label: 'numpy' },
  { spec: 'gfit', deps: true, label: 'gfit' },
  { spec: 'tqdm', deps: true, label: 'tqdm' },
  { spec: HYLITE_WHEEL_URL, deps: false, label: 'hylite' },
]

export const ISPEC_LIBRARY_BOOTSTRAP = `
from hylite.analyse.fourier import FourierArchive

library = FourierArchive()
_loaded_ids = []


def _entry_prefix(lib_id):
    return str(lib_id) + ":"


def export_library_state():
    return {
        "loaded_libraries": list(_loaded_ids),
        "entries": list(library.keys()),
        "n_hy_fourier": len(library),
    }


def remove_library(lib_id):
    global library, _loaded_ids
    lib_id = str(lib_id)
    prefix = _entry_prefix(lib_id)
    removed = 0
    for key in list(library.keys()):
        if str(key).startswith(prefix):
            del library[key]
            removed += 1
    if lib_id in _loaded_ids:
        _loaded_ids.remove(lib_id)
    print(f"Removed library {lib_id!r} ({removed} HyFourier entries)")
    return export_library_state()


def add_library_from_bytes(lib_id, data):
    global library, _loaded_ids
    lib_id = str(lib_id)
    if lib_id in _loaded_ids:
        remove_library(lib_id)

    archive = FourierArchive.load_bytes(data)
    prefix = _entry_prefix(lib_id)
    for key, hyf in archive.items():
        library[prefix + str(key)] = hyf

    if lib_id not in _loaded_ids:
        _loaded_ids.append(lib_id)

    print(
        f"Loaded library {lib_id!r}: {len(archive)} HyFourier entries "
        f"({len(library)} total in archive)"
    )
    return export_library_state()
`

export const ISPEC_QUERY_BOOTSTRAP = `
# Search results — updated only by run_search() / clear_search() (Query widget).
result = None


def export_search_result():
    if result is None:
        return {"names": [], "scores": [], "total": 0}
    names, scores = result
    return {
        "names": list(names),
        "scores": [float(s) for s in scores],
        "total": len(names),
    }


def clear_search():
    global result
    result = None
    return export_search_result()


def run_search(query, confidence=10.0, n_result=10000):
    global result
    query = str(query).strip()
    if not query:
        return clear_search()
    confidence = float(confidence)
    if confidence <= 0:
        raise ValueError("confidence must be positive.")
    names, scores = library.search(query, confidence=confidence, n_result=int(n_result))
    result = (names, scores)
    print(f"Search {query!r}: {len(names)} matches")
    return export_search_result()


# Selection — updated only by add_to_selection() / remove_from_selection() (Query widget).
selection = []


def export_selection():
    return list(selection)


def add_to_selection(name):
    global selection
    name = str(name)
    if name not in selection:
        selection.append(name)
    return export_selection()


def remove_from_selection(name):
    global selection
    name = str(name)
    if name in selection:
        selection.remove(name)
    return export_selection()


def set_selection(names):
    global selection
    selection = [str(name) for name in names]
    return export_selection()


def _reflectance_pct(values):
    import numpy as np

    refl = np.asarray(values, dtype=np.float64)
    if np.nanmax(refl) <= 2.0:
        refl = refl * 100.0
    return np.nan_to_num(refl, nan=0.0)


def _first_spectrum(hydata):
    import numpy as np

    data = np.asarray(hydata.data, dtype=np.float64)
    if data.ndim == 3:
        return data[0, 0, :]
    if data.ndim == 2:
        return data[0, :]
    return data.reshape(-1)


def _export_wavelengths(hydata):
    import numpy as np

    wav = np.asarray(hydata.get_wavelengths(), dtype=np.float64).reshape(-1)
    if wav.size == 0:
        raise ValueError("Spectrum has no wavelength grid.")
    if np.nanmax(wav) <= 100.0:
        wav = wav * 1000.0
    return wav


def _reflectance_fraction(values):
    import numpy as np

    refl = np.asarray(values, dtype=np.float64)
    if np.nanmax(refl) > 2.0:
        refl = refl / 100.0
    return np.nan_to_num(refl, nan=0.0)


def _merge_reflectance(full_wav, full_refl, corr_wav, corr_refl):
    import numpy as np

    merged = np.asarray(full_refl, dtype=np.float64).copy()
    full_wav = np.asarray(full_wav, dtype=np.float64)
    corr_wav = np.asarray(corr_wav, dtype=np.float64)
    corr_refl = np.asarray(corr_refl, dtype=np.float64)
    for w, r in zip(corr_wav, corr_refl):
        idx = int(np.searchsorted(full_wav, w))
        candidates = [idx - 1, idx]
        best = None
        best_delta = np.inf
        for candidate in candidates:
            if candidate < 0 or candidate >= full_wav.size:
                continue
            delta = abs(full_wav[candidate] - w)
            if delta < best_delta:
                best_delta = delta
                best = candidate
        if best is not None and best_delta <= 0.5:
            merged[best] = r
    return merged


def _spans_wavelength_range(wav, x_min, x_max, thresh=25.0):
    import numpy as np

    wav = np.asarray(wav, dtype=np.float64)
    if wav.size == 0:
        return False
    wav_min = float(np.min(wav))
    wav_max = float(np.max(wav))
    return wav_min <= float(x_min) + thresh and wav_max >= float(x_max) - thresh


def apply_hull_to_spectra(names, x_min, x_max, lookup_map=None):
    from hylite.correct.detrend import get_hull_corrected
    import numpy as np

    lookup_map = lookup_map or {}
    x_min = float(x_min)
    x_max = float(x_max)
    if x_max <= x_min:
        raise ValueError("Invalid wavelength range for hull correction.")

    spectra = []
    for name in names:
        name = str(name)
        lookup = str(lookup_map.get(name, name))
        hydata = library.getSpectraByName(lookup)
        full_wav = _export_wavelengths(hydata)
        full_refl = _reflectance_fraction(_first_spectrum(hydata))
        order = np.argsort(full_wav)
        full_wav = full_wav[order]
        full_refl = full_refl[order]

        if not _spans_wavelength_range(full_wav, x_min, x_max):
            continue

        hull = "upper" if x_min < 6000.0 else "lower"
        corrected = get_hull_corrected(
            hydata,
            band_range=(x_min, x_max),
            method="div",
            hull=hull,
            vb=False,
        )
        corr_wav = _export_wavelengths(corrected)
        corr_refl = _reflectance_fraction(_first_spectrum(corrected))
        corr_order = np.argsort(corr_wav)
        corr_wav = corr_wav[corr_order]
        corr_refl = corr_refl[corr_order]
        merged_refl = _merge_reflectance(full_wav, full_refl, corr_wav, corr_refl)
        spectra.append(
            {
                "name": name,
                "wavelengths": full_wav.tolist(),
                "reflectance": merged_refl.tolist(),
            }
        )

    return {"spectra": spectra}


def export_spectra_plot_data(page_start, page_end, lookup_map=None):
    import numpy as np

    lookup_map = lookup_map or {}
    page_start = int(page_start)
    page_end = int(page_end)
    entries = {}

    if result is not None:
        names, scores = result
        for i in range(page_start, min(page_end, len(names))):
            name = str(names[i])
            entries[name] = {
                "name": name,
                "rank": i + 1,
                "score": float(scores[i]),
                "selected": False,
            }

    for name in selection:
        name = str(name)
        if name in entries:
            entries[name]["selected"] = True
        else:
            entries[name] = {
                "name": name,
                "rank": None,
                "score": None,
                "selected": True,
            }

    if not entries:
        return {"spectra": []}

    spectra = []
    for name in entries:
        meta = entries[name]
        lookup = str(lookup_map.get(name, name))
        hydata = library.getSpectraByName(lookup)
        wav = _export_wavelengths(hydata)
        refl = _reflectance_pct(_first_spectrum(hydata))
        if wav.size != refl.size:
            raise ValueError(
                "Wavelength/reflectance length mismatch for %r (%d vs %d)."
                % (name, wav.size, refl.size)
            )
        order = np.argsort(wav)
        wav = wav[order]
        refl = refl[order]
        spectra.append(
            {
                "name": meta["name"],
                "rank": meta["rank"],
                "score": meta["score"],
                "selected": bool(meta["selected"]),
                "wavelengths": wav.tolist(),
                "reflectance": refl.tolist(),
            }
        )

    return {"spectra": spectra}
`

export const ISPEC_BOOTSTRAP = `
class AppState:
    def __init__(self):
        self.libraries = []
        self.query = ""
        self.slice = (0, 0)
        self.selection = []

    def export(self):
        return {
            "libraries": list(self.libraries),
            "query": self.query,
            "slice": list(self.slice),
            "selection": list(self.selection),
        }

    def apply(self, data):
        if "libraries" in data:
            self.libraries = list(data["libraries"])
        if "query" in data:
            self.query = data["query"]
        if "slice" in data:
            self.slice = tuple(data["slice"])
        if "selection" in data:
            self.selection = list(data["selection"])
            set_selection(self.selection)

state = AppState()

def restore_ui_state(data):
    state.apply(data)
    return state.export()
`

export const PYTHON_INIT_CODE = `
${ISPEC_LIBRARY_BOOTSTRAP}

${ISPEC_QUERY_BOOTSTRAP}

${ISPEC_BOOTSTRAP}

import hylite
print(f"hylite {getattr(hylite, '__version__', 'dev')} ready")
`
