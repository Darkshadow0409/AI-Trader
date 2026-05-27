from __future__ import annotations

import argparse
import contextlib
import fnmatch
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_EXCLUDES = {
    ".git",
    ".venv",
    "__pycache__",
    "node_modules",
    "dist",
    "coverage",
    "graphify-out",
    "review_bundle",
    "data",
}


def _load_ignore_patterns(root: Path) -> list[str]:
    path = root / ".graphifyignore"
    if not path.exists():
        return []
    patterns: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line.rstrip("/"))
    return patterns


def _is_ignored(path: Path, root: Path, patterns: list[str]) -> bool:
    parts = set(path.relative_to(root).parts)
    if parts & DEFAULT_EXCLUDES:
        return True
    rel = path.relative_to(root).as_posix()
    for pattern in patterns:
        if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(rel, f"{pattern}/*"):
            return True
    return False


def _diagnostics_dir(root: Path) -> Path:
    path = root / "data" / "diagnostics"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _log_path(root: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return _diagnostics_dir(root) / f"graphify-rebuild-{stamp}.log"


class _Tee:
    def __init__(self, *streams) -> None:
        self._streams = streams

    def write(self, value: str) -> int:
        for stream in self._streams:
            stream.write(value)
        return len(value)

    def flush(self) -> None:
        for stream in self._streams:
            stream.flush()


def _collect_code_files(root: Path, patterns: list[str]) -> list[Path]:
    from graphify.extract import collect_files

    files = collect_files(root, follow_symlinks=False)
    return [file_path for file_path in files if file_path.exists() and not _is_ignored(file_path, root, patterns)]


def _run_rebuild(root: Path, *, mode: str) -> bool:
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.export import to_json
    from graphify.extract import extract
    from graphify.report import generate

    patterns = _load_ignore_patterns(root)
    code_files = _collect_code_files(root, patterns)
    if not code_files:
        print("[graphify rebuild] no supported code files found")
        return False

    result = extract(code_files)
    detection = {
        "files": {"code": [str(file_path) for file_path in code_files], "document": [], "paper": [], "image": []},
        "total_files": len(code_files),
        "total_words": 0,
    }
    graph = build_from_json(result)
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    labels = {community_id: f"Community {community_id}" for community_id in communities}
    if mode == "full":
        questions = suggest_questions(graph, communities, labels)
    else:
        print("[graphify rebuild] fast mode: skipping suggest_questions() hotspot for daily Windows use")
        questions = []

    out = root / "graphify-out"
    out.mkdir(parents=True, exist_ok=True)
    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        {"input": 0, "output": 0},
        str(root),
        suggested_questions=questions,
    )
    (out / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(out / "graph.json"))
    flag = out / "needs_update"
    if flag.exists():
        flag.unlink()

    print(
        f"[graphify rebuild] Rebuilt {graph.number_of_nodes()} nodes / "
        f"{graph.number_of_edges()} edges / {len(communities)} communities"
    )
    print(f"[graphify rebuild] Updated {out / 'GRAPH_REPORT.md'} and {out / 'graph.json'}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Windows-safe Graphify rebuild wrapper.")
    parser.add_argument("--mode", choices=("fast", "full"), default="fast")
    parser.add_argument("--path", default=".")
    parser.add_argument("--traceback-timeout-seconds", type=int, default=180)
    args = parser.parse_args()

    root = Path(args.path).resolve()
    log_path = _log_path(root)
    log_file = log_path.open("w", encoding="utf-8")
    with contextlib.ExitStack() as stack:
        stack.enter_context(log_file)
        tee = _Tee(sys.__stdout__, log_file)
        stack.enter_context(contextlib.redirect_stdout(tee))
        stack.enter_context(contextlib.redirect_stderr(tee))
        try:
            import faulthandler

            faulthandler.enable(file=log_file)
            faulthandler.dump_traceback_later(args.traceback_timeout_seconds, repeat=True, file=log_file)
            print(f"[graphify rebuild] log={log_path}")
            print(f"[graphify rebuild] mode={args.mode}")
            print(f"[graphify rebuild] repo={root}")
            print(f"[graphify rebuild] interpreter={sys.executable}")
            print(f"[graphify rebuild] utf8_mode={sys.flags.utf8_mode}")
            print(f"[graphify rebuild] pid={os.getpid()}")
            ok = _run_rebuild(root, mode=args.mode)
            return 0 if ok else 1
        except Exception:
            print("[graphify rebuild] rebuild failed with exception:")
            traceback.print_exc()
            return 1
        finally:
            try:
                import faulthandler

                faulthandler.cancel_dump_traceback_later()
            except Exception:
                pass
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
