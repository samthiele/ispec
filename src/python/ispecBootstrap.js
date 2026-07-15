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


def _split_or_queries(query):
    parts = [part.strip() for part in str(query).split("|")]
    return [part for part in parts if part]


def _merge_or_search_results(query_results):
    best_rank = {}
    for names, scores in query_results:
        for rank, name in enumerate(names):
            score = float(scores[rank])
            if name not in best_rank or rank < best_rank[name][0]:
                best_rank[name] = (rank, score)

    emitted = set()
    merged_names = []
    merged_scores = []
    max_len = max((len(names) for names, _ in query_results), default=0)

    for rank_index in range(max_len):
        for names, _scores in query_results:
            if rank_index >= len(names):
                continue
            name = names[rank_index]
            if name in emitted:
                continue
            emitted.add(name)
            _rank, score = best_rank[name]
            merged_names.append(name)
            merged_scores.append(score)

    return merged_names, merged_scores


def run_search(query, confidence=10.0, n_result=10000):
    global result
    query = str(query).strip()
    if not query:
        return clear_search()
    confidence = float(confidence)
    if confidence <= 0:
        raise ValueError("confidence must be positive.")
    n_result = int(n_result)
    sub_queries = _split_or_queries(query)
    if len(sub_queries) <= 1:
        names, scores = library.search(query, confidence=confidence, n_result=n_result)
        print(f"Search {query!r}: {len(names)} matches")
    else:
        query_results = []
        for sub_query in sub_queries:
            sub_names, sub_scores = library.search(
                sub_query, confidence=confidence, n_result=n_result
            )
            query_results.append((sub_names, sub_scores))
        names, scores = _merge_or_search_results(query_results)
        print(
            f"Search {query!r} ({len(sub_queries)} parts): {len(names)} matches"
        )
    result = (names, scores)
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


def _trim_constant_edges(wav, refl, min_run=3, atol=0.05, min_span_nm=20.0):
    """Drop leading/trailing flat runs from hylite NaN fill extrapolation."""
    import numpy as np

    wav = np.asarray(wav, dtype=np.float64)
    refl = np.asarray(refl, dtype=np.float64)
    n = int(refl.size)
    if n <= min_run:
        return wav, refl

    lo = 0
    while lo < n - min_run:
        end = lo + 1
        while end < n and abs(refl[end] - refl[lo]) <= atol:
            end += 1
        run = end - lo
        span = float(wav[end - 1] - wav[lo]) if end - 1 > lo else 0.0
        if run >= min_run and span >= min_span_nm:
            lo = end
            continue
        break

    hi = n
    while hi > lo + min_run:
        start = hi - 1
        while start > lo and abs(refl[start] - refl[hi - 1]) <= atol:
            start -= 1
        start += 1
        run = hi - start
        span = float(wav[hi - 1] - wav[start]) if hi - 1 > start else 0.0
        if run >= min_run and span >= min_span_nm:
            hi = start
            continue
        break

    if hi <= lo:
        return wav, refl
    return wav[lo:hi], refl[lo:hi]


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


def _hull_correct_series(hydata, full_wav, full_refl, x_min, x_max):
    from hylite.correct.detrend import get_hull_corrected
    import numpy as np

    if not _spans_wavelength_range(full_wav, x_min, x_max):
        return None

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
    return {
        "wavelengths": np.asarray(full_wav, dtype=np.float64).tolist(),
        "reflectance": merged_refl.tolist(),
    }


def apply_hull_to_spectra(names, x_min, x_max, lookup_map=None):
    from hylite.hylibrary import HyLibrary
    import numpy as np

    lookup_map = lookup_map or {}
    x_min = float(x_min)
    x_max = float(x_max)
    if x_max <= x_min:
        raise ValueError("Invalid wavelength range for hull correction.")

    spectra = []
    for name in names:
        name = str(name)
        if name in virtual_spectra:
            entry = virtual_spectra[name]
            full_wav = np.asarray(entry["wavelengths"], dtype=np.float64)
            full_refl = _reflectance_fraction(np.asarray(entry["reflectance"], dtype=np.float64))
            order = np.argsort(full_wav)
            full_wav = full_wav[order]
            full_refl = full_refl[order]
            hydata = HyLibrary(full_refl.reshape(1, 1, -1), wav=full_wav)
        else:
            lookup = str(lookup_map.get(name, name))
            hydata = library.getSpectraByName(lookup)
            full_wav = _export_wavelengths(hydata)
            full_refl = _reflectance_fraction(_first_spectrum(hydata))
            order = np.argsort(full_wav)
            full_wav = full_wav[order]
            full_refl = full_refl[order]

        result = _hull_correct_series(hydata, full_wav, full_refl, x_min, x_max)
        if result is None:
            continue
        spectra.append({"name": name, **result})

    return {"spectra": spectra}


virtual_spectra = {}


def _spectrum_series(name, lookup_map=None):
    import numpy as np

    name = str(name)
    lookup_map = lookup_map or {}

    if name in virtual_spectra:
        entry = virtual_spectra[name]
        wav = np.asarray(entry["wavelengths"], dtype=np.float64)
        refl = np.asarray(entry["reflectance"], dtype=np.float64)
    else:
        lookup = str(lookup_map.get(name, name))
        hydata = library.getSpectraByName(lookup)
        wav = _export_wavelengths(hydata)
        refl = _reflectance_pct(_first_spectrum(hydata))
        wav, refl = _trim_constant_edges(wav, refl)

    if wav.size == 0 or wav.size != refl.size:
        raise ValueError("Spectrum %r has no usable wavelength/reflectance data." % name)

    order = np.argsort(wav)
    wav = wav[order]
    refl = refl[order]
    return wav, refl


def register_virtual_spectrum(name, wavelengths, reflectance):
    import numpy as np

    name = str(name)
    wav = np.asarray(wavelengths, dtype=np.float64)
    refl = np.asarray(reflectance, dtype=np.float64)
    if wav.size == 0 or wav.size != refl.size:
        raise ValueError("Virtual spectrum %r requires matching wavelength/reflectance arrays." % name)
    order = np.argsort(wav)
    virtual_spectra[name] = {
        "wavelengths": wav[order].tolist(),
        "reflectance": refl[order].tolist(),
    }
    return {"name": name, "n_points": int(wav.size)}


def remove_virtual_spectrum(name):
    name = str(name)
    if name in virtual_spectra:
        del virtual_spectra[name]
    return list(virtual_spectra.keys())


def clear_virtual_spectra():
    global virtual_spectra
    virtual_spectra = {}
    return []


def sync_virtual_spectra(entries):
    global virtual_spectra
    virtual_spectra = {}
    if not entries:
        return []
    for name, payload in entries.items():
        register_virtual_spectrum(name, payload["wavelengths"], payload["reflectance"])
    return list(virtual_spectra.keys())


def export_selection_spectrum_series(names, lookup_map=None):
    lookup_map = lookup_map or {}
    spectra = []
    for name in names:
        name = str(name)
        try:
            wav, refl = _spectrum_series(name, lookup_map)
        except ValueError as exc:
            spectra.append({"name": name, "error": str(exc)})
            continue
        spectra.append(
            {
                "name": name,
                "wavelengths": wav.tolist(),
                "reflectance": refl.tolist(),
            }
        )
    return {"spectra": spectra}


def create_weighted_mixture(components, output_name):
    import numpy as np

    if not components:
        raise ValueError("Mixture requires at least one component.")

    output_name = str(output_name)
    lookup_map = {}
    weights = []
    series = []

    for component in components:
        name = str(component["name"])
        weight = float(component.get("weight_pct", 0.0))
        if weight <= 0.0:
            continue
        lookup = component.get("lookup")
        if lookup is not None:
            lookup_map[name] = str(lookup)
        wav, refl = _spectrum_series(name, lookup_map)
        series.append((wav, refl))
        weights.append(weight)

    if not series:
        raise ValueError("Mixture requires at least one component with weight > 0.")

    weights = np.asarray(weights, dtype=np.float64)
    weights = weights / np.sum(weights)

    union_wav = np.unique(np.concatenate([wav for wav, _ in series]))
    if union_wav.size == 0:
        raise ValueError("Mixture components have no wavelength samples.")

    mixed = np.zeros(union_wav.shape, dtype=np.float64)
    for weight, (wav, refl) in zip(weights, series):
        mixed += weight * np.interp(union_wav, wav, refl, left=np.nan, right=np.nan)

    valid = np.isfinite(mixed)
    if not np.any(valid):
        raise ValueError("Mixture produced no finite reflectance values.")

    union_wav = union_wav[valid]
    mixed = mixed[valid]
    register_virtual_spectrum(output_name, union_wav, mixed)
    return {
        "name": output_name,
        "wavelengths": union_wav.tolist(),
        "reflectance": mixed.tolist(),
    }


def _page_spectra_meta(page_start, page_end):
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

    return list(entries.values())


def export_spectra_plot_data(page_start, page_end, lookup_map=None):
    import numpy as np

    lookup_map = lookup_map or {}
    metas = _page_spectra_meta(page_start, page_end)

    if not metas:
        return {"spectra": []}

    spectra = []
    for meta in metas:
        name = meta["name"]
        lookup = str(lookup_map.get(name, name))
        try:
            wav, refl = _spectrum_series(name, lookup_map)
        except ValueError:
            continue
        if wav.size != refl.size:
            raise ValueError(
                "Wavelength/reflectance length mismatch for %r (%d vs %d)."
                % (name, wav.size, refl.size)
            )
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

export const ISPEC_LLM_BOOTSTRAP = `
from hylite.analyse.fourier import (
    _archiveDisplayNameMatchesQuery,
    _normalizeSampleNameQueries,
    _parseOptionalArchivePrefix,
    _sampleNames,
)

SPECTRAL_BANDS_NM = {
    "VNIR": (400.0, 1000.0),
    "SWIR": (1000.0, 2500.0),
    "MWIR": (2500.0, 5000.0),
    "LWIR": (5000.0, 14500.0),
}


def _resolve_hyfourier_row(library, lookup):
    queries = _normalizeSampleNameQueries(str(lookup))
    for query in queries:
        query_key, _ = _parseOptionalArchivePrefix(query)
        if query_key is not None:
            if query_key not in library:
                continue
            entries = [(query_key, library[query_key])]
        else:
            entries = library.items()
        for key, hyf in entries:
            labels = _sampleNames(
                hyf.header,
                hyf.n_spectra,
                hyf.original_shape,
                hyf.spatial_shape,
            )
            for row, label in enumerate(labels):
                if hyf._valid[row] and _archiveDisplayNameMatchesQuery(key, label, query):
                    return hyf, row, key, label
    raise ValueError("No spectra match name %r in any archive entry." % lookup)


def _wavelength_range_nm(hyf):
    wav_min = float(hyf.wav_range[0])
    wav_max = float(hyf.wav_range[1])
    if wav_max <= 100.0:
        wav_min *= 1000.0
        wav_max *= 1000.0
    return wav_min, wav_max


def _top_features(features, n=5):
    ranked = sorted(
        [f for f in features if not f.get("fake", False)],
        key=lambda f: -float(f["prominence"]),
    )[: int(n)]
    return [
        {
            "wavelength_nm": float(f["wavelength"]),
            "prominence": float(f["prominence"]),
        }
        for f in ranked
    ]


def _wavelength_range_nm_from_lists(wavelengths):
    import numpy as np

    wav = np.asarray(wavelengths, dtype=np.float64)
    if wav.size == 0:
        return 0.0, 0.0
    return float(np.min(wav)), float(np.max(wav))


def _bands_for_virtual_spectrum(wavelengths, reflectance):
    wav_min, wav_max = _wavelength_range_nm_from_lists(wavelengths)
    bands = {}
    for band_name, (band_min, band_max) in SPECTRAL_BANDS_NM.items():
        if not _spans_wavelength_range([wav_min, wav_max], band_min, band_max):
            bands[band_name] = {
                "available": False,
                "range_nm": [band_min, band_max],
            }
        else:
            bands[band_name] = {
                "available": True,
                "range_nm": [band_min, band_max],
                "minima": [],
                "maxima": [],
            }
    return bands


def export_selection_spectral_features(names, lookup_map=None):
    lookup_map = lookup_map or {}
    spectra = []

    for name in names:
        name = str(name)
        lookup = str(lookup_map.get(name, name))
        if name in virtual_spectra:
            wav_min, wav_max = _wavelength_range_nm_from_lists(
                virtual_spectra[name]["wavelengths"]
            )
            bands = _bands_for_virtual_spectrum(
                virtual_spectra[name]["wavelengths"],
                virtual_spectra[name]["reflectance"],
            )
            spectra.append(
                {
                    "name": name,
                    "label": lookup,
                    "archive": "virtual",
                    "sample": lookup,
                    "wavelength_range_nm": [wav_min, wav_max],
                    "bands": bands,
                    "virtual": True,
                }
            )
            continue
        try:
            hyf, row, archive_key, sample_label = _resolve_hyfourier_row(library, lookup)
        except ValueError as exc:
            spectra.append({"name": name, "error": str(exc)})
            continue

        wav_min, wav_max = _wavelength_range_nm(hyf)
        bands = {}
        for band_name, (band_min, band_max) in SPECTRAL_BANDS_NM.items():
            available = _spans_wavelength_range([wav_min, wav_max], band_min, band_max)
            if not available:
                bands[band_name] = {
                    "available": False,
                    "range_nm": [band_min, band_max],
                }
                continue

            minima = hyf.minima(minw=band_min, maxW=band_max, format="list")
            maxima = hyf.maxima(minw=band_min, maxW=band_max, format="list")
            row_min = minima[row] if row < len(minima) else []
            row_max = maxima[row] if row < len(maxima) else []
            bands[band_name] = {
                "available": True,
                "range_nm": [band_min, band_max],
                "minima": _top_features(row_min, 5),
                "maxima": _top_features(row_max, 5),
            }

        spectra.append(
            {
                "name": name,
                "label": lookup,
                "archive": archive_key,
                "sample": sample_label,
                "wavelength_range_nm": [wav_min, wav_max],
                "bands": bands,
            }
        )

    return {"spectra": spectra}
`

export const ISPEC_BIPLOT_BOOTSTRAP = `
def _parse_feature_number(text):
    number = float(text)
    if not number > 0:
        raise ValueError("Wavelength values must be positive.")
    return number


def _parse_spectral_expression(expr):
    expr = str(expr).strip()
    if not expr:
        raise ValueError("Empty spectral attribute expression.")

    compact = expr.replace(" ", "")
    is_peak = compact.startswith("^")
    if is_peak:
        compact = compact[1:]

    if compact and compact[-1] in ("D", "P"):
        kind = compact[-1]
        body = compact[:-1]
        if "-" in body:
            start_text, end_text = body.split("-", 1)
            if not start_text or not end_text:
                raise ValueError("Invalid wavelength range in %r." % expr)
            start = _parse_feature_number(start_text)
            end = _parse_feature_number(end_text)
            if end <= start:
                raise ValueError("Invalid wavelength range in %r." % expr)
            return {
                "type": "feature",
                "peak": is_peak,
                "range": (start, end),
                "center": None,
                "metric": "depth" if kind == "D" else "position",
            }

        if body:
            center = _parse_feature_number(body)
            return {
                "type": "feature",
                "peak": is_peak,
                "range": None,
                "center": center,
                "metric": "depth" if kind == "D" else "position",
            }

    return {"type": "bandmath", "expression": expr}


def _parse_optional_spectral_expression(expr):
    expr = str(expr or "").strip()
    if not expr:
        return None
    return _parse_spectral_expression(expr)


def _load_spectrum_biplot(name, lookup_map=None):
    import numpy as np

    wav, refl = _spectrum_series(name, lookup_map)
    refl_frac = _reflectance_fraction(refl if np.nanmax(refl) <= 2.0 else refl / 100.0)
    return wav, refl_frac


def _hydata_from_spectrum(wav, refl_frac):
    from hylite.hylibrary import HyLibrary

    return HyLibrary(refl_frac.reshape(1, 1, -1), wav=wav)


def _hydata_for_spectrum(name, lookup_map=None):
    wav, refl_frac = _load_spectrum_biplot(name, lookup_map)
    return _hydata_from_spectrum(wav, refl_frac)


def _mask_for_feature(wav, parsed, width):
    import numpy as np

    wav = np.asarray(wav, dtype=np.float64)
    if parsed.get("range") is not None:
        wmin, wmax = parsed["range"]
        return (wav >= wmin) & (wav <= wmax)
    center = float(parsed["center"])
    half = float(width) / 2.0
    return (wav >= center - half) & (wav <= center + half)


def _deepest_minima(wav, refl, mask):
    import numpy as np

    if not np.any(mask):
        return float("nan"), float("nan")
    w = wav[mask]
    r = refl[mask]
    idx = int(np.argmin(r))
    depth = float(np.max(r) - r[idx])
    return depth, float(w[idx])


def _largest_maxima(wav, refl, mask):
    import numpy as np

    if not np.any(mask):
        return float("nan"), float("nan")
    w = wav[mask]
    r = refl[mask]
    idx = int(np.argmax(r))
    height = float(r[idx] - np.min(r))
    return height, float(w[idx])


def _eval_parsed_spectral(wav, refl_frac, hydata, parsed, width, expression, name):
    import numpy as np

    if parsed["type"] == "bandmath":
        if hydata is None:
            hydata = _hydata_from_spectrum(wav, refl_frac)
        out = hydata.eval(parsed["expression"])
        val = float(np.asarray(out.data, dtype=np.float64).reshape(-1)[0])
        if not np.isfinite(val):
            raise ValueError(
                "Band math expression %r returned non-finite value for %r."
                % (expression, name)
            )
        return val

    mask = _mask_for_feature(wav, parsed, width)

    if parsed["peak"]:
        depth, pos = _largest_maxima(wav, refl_frac, mask)
    else:
        depth, pos = _deepest_minima(wav, refl_frac, mask)

    value = depth if parsed["metric"] == "depth" else pos
    if not np.isfinite(value):
        raise ValueError(
            "Feature expression %r returned non-finite value for %r."
            % (expression, name)
        )
    return float(value)


def eval_spectral_attribute(name, expression, width=50.0, lookup_map=None):
    lookup_map = lookup_map or {}
    parsed = _parse_spectral_expression(expression)
    wav, refl_frac = _load_spectrum_biplot(name, lookup_map)
    hydata = (
        _hydata_from_spectrum(wav, refl_frac)
        if parsed["type"] == "bandmath"
        else None
    )
    return _eval_parsed_spectral(
        wav, refl_frac, hydata, parsed, width, expression, name
    )


def _eval_optional_attribute(name, expression, width, lookup_map):
    parsed = _parse_optional_spectral_expression(expression)
    if parsed is None:
        return None
    wav, refl_frac = _load_spectrum_biplot(name, lookup_map)
    hydata = (
        _hydata_from_spectrum(wav, refl_frac)
        if parsed["type"] == "bandmath"
        else None
    )
    return _eval_parsed_spectral(
        wav, refl_frac, hydata, parsed, width, str(expression).strip(), name
    )


def export_biplot_data(
    page_start,
    page_end,
    lookup_map=None,
    x_expr="",
    y_expr="",
    width=50.0,
    color_expr="",
    opacity_expr="",
    size_expr="",
):
    lookup_map = lookup_map or {}
    x_expr = str(x_expr).strip()
    y_expr = str(y_expr).strip()
    if not x_expr or not y_expr:
        raise ValueError("Both X and Y attribute expressions are required.")

    width = float(width)
    if width <= 0:
        raise ValueError("Feature width must be positive.")

    x_parsed = _parse_spectral_expression(x_expr)
    y_parsed = _parse_spectral_expression(y_expr)
    color_parsed = _parse_optional_spectral_expression(color_expr)
    opacity_parsed = _parse_optional_spectral_expression(opacity_expr)
    size_parsed = _parse_optional_spectral_expression(size_expr)
    optional_attrs = (
        ("color", color_expr, color_parsed),
        ("opacity", opacity_expr, opacity_parsed),
        ("size", size_expr, size_parsed),
    )
    need_bandmath = any(
        parsed is not None and parsed["type"] == "bandmath"
        for parsed in (x_parsed, y_parsed, color_parsed, opacity_parsed, size_parsed)
    )

    points = []
    errors = []

    for meta in _page_spectra_meta(page_start, page_end):
        name = meta["name"]
        try:
            wav, refl_frac = _load_spectrum_biplot(name, lookup_map)
            hydata = _hydata_from_spectrum(wav, refl_frac) if need_bandmath else None
            point = {
                "name": name,
                "rank": meta["rank"],
                "score": meta["score"],
                "selected": bool(meta["selected"]),
                "x": _eval_parsed_spectral(
                    wav, refl_frac, hydata, x_parsed, width, x_expr, name
                ),
                "y": _eval_parsed_spectral(
                    wav, refl_frac, hydata, y_parsed, width, y_expr, name
                ),
                "color": None,
                "opacity": None,
                "size": None,
            }
            for key, expr, parsed in optional_attrs:
                if parsed is not None:
                    point[key] = _eval_parsed_spectral(
                        wav, refl_frac, hydata, parsed, width, str(expr).strip(), name
                    )
            points.append(point)
        except ValueError as exc:
            errors.append({"name": name, "error": str(exc)})

    return {"points": points, "errors": errors}
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

${ISPEC_LLM_BOOTSTRAP}

${ISPEC_BIPLOT_BOOTSTRAP}

${ISPEC_BOOTSTRAP}

import hylite
hylite.band_select_threshold = 100
print(f"hylite {getattr(hylite, '__version__', 'dev')} ready")
`
