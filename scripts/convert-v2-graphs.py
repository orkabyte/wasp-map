#!/usr/bin/env python3
"""
Convert V2 graph cache JSONs from Simba into per-chunk web map files.

Reads: osrs-simba/Data/cache/map/{version}/graphs/{plane}/{chunk}-{hash}.json
Writes: wasp-map/static/data_osrs/graphs/{plane}/{chunkX}-{chunkY}.json
        wasp-map/static/data_osrs/graphs/index.json

Each Simba graph JSON contains base64+zlib compressed node/path/name/door data
in local bitmap coordinates. This script converts them to global coordinates
(Chunk2Coordinate system) for the web map.

Coordinate system:
  Global X = chunkX * 256 - 4096 + localX
  Global Y = (50176 - chunkY * 256) + localY

The web map converts to leaflet coords:
  lat = (50428 - globalY) / 4
  lng = (globalX + 4096) / 4
"""

import base64
import json
import os
import re
import sys
import zlib
from collections import defaultdict
from pathlib import Path

# Constants matching RSTranslator
CHUNK_SIDE = 256       # 4 pixels/tile * 64 tiles/chunk
SCOPE_X1 = 4096       # 16 * 256
SCOPE_Y2 = 50176      # 196 * 256


def decode_simba_compressed(b64_str: str) -> str:
    """Decode Simba's Base64Encode(CompressString(data)) format."""
    decoded = base64.b64decode(b64_str)
    # Simba's CompressString prepends a 4-byte LE decompressed-size header
    decompressed = zlib.decompress(decoded[4:])
    return decompressed.decode("utf-8")


def parse_bracketed(s: str) -> list[str]:
    """Extract all [...] elements from a string like '[a b][c d]'."""
    return re.findall(r"\[([^\]]*)\]", s)


def parse_nodes(b64_str: str) -> list[tuple[int, int]]:
    """Parse compressed nodes string into list of (x, y) points."""
    raw = decode_simba_compressed(b64_str)
    nodes = []
    for elem in parse_bracketed(raw):
        parts = elem.split()
        if len(parts) == 2:
            nodes.append((int(parts[0]), int(parts[1])))
    return nodes


def parse_paths(b64_str: str) -> list[list[int]]:
    """Parse compressed paths string into adjacency lists."""
    raw = decode_simba_compressed(b64_str)
    paths = []
    for elem in parse_bracketed(raw):
        if elem.strip() == "":
            paths.append([])
        else:
            paths.append([int(x) for x in elem.split()])
    return paths


def parse_doors(b64_str: str) -> list[dict]:
    """Parse compressed doors string into list of door records."""
    raw = decode_simba_compressed(b64_str)
    doors = []
    for elem in parse_bracketed(raw):
        parts = elem.split()
        if len(parts) >= 10:
            doors.append({
                "before": [int(parts[0]), int(parts[1])],
                "after": [int(parts[2]), int(parts[3])],
                "center": [int(parts[4]), int(parts[5])],
                "direction": [int(parts[6]), int(parts[7])],
                "type": int(parts[8]),
                "separating": int(parts[9]) != 0,
            })
    return doors


def chunk2coordinate(chunk_x: int, chunk_y: int) -> tuple[int, int]:
    """Convert chunk coordinates to global map coordinates (top-left of chunk)."""
    gx = chunk_x * CHUNK_SIDE - SCOPE_X1
    gy = SCOPE_Y2 - chunk_y * CHUNK_SIDE
    return (gx, gy)


def paths_to_edges(paths: list[list[int]]) -> list[tuple[int, int]]:
    """Convert adjacency-list paths to a deduplicated edge list."""
    edges = set()
    for i, adj in enumerate(paths):
        for j in adj:
            edge = (min(i, j), max(i, j))
            edges.add(edge)
    return sorted(edges)


def convert_graph(
    nodes: list[tuple[int, int]],
    paths: list[list[int]],
    doors: list[dict],
    chunk_x: int,
    chunk_y: int,
) -> dict:
    """Convert a single-chunk graph from local to global coordinates."""
    offset_x, offset_y = chunk2coordinate(chunk_x, chunk_y)

    global_nodes = []
    for lx, ly in nodes:
        global_nodes.append([lx + offset_x, ly + offset_y])

    edges = paths_to_edges(paths)

    result = {
        "nodes": global_nodes,
        "edges": [list(e) for e in edges],
    }

    if doors:
        global_doors = []
        for door in doors:
            if not door["separating"]:
                continue
            global_doors.append([
                door["center"][0] + offset_x,
                door["center"][1] + offset_y,
            ])
        if global_doors:
            result["doors"] = global_doors

    return result


def find_cache_dirs(simba_root: Path) -> list[Path]:
    """Find all Simba graph cache directories, newest first."""
    cache_base = simba_root / "Data" / "cache" / "map"
    if not cache_base.exists():
        return []

    results = []
    for version_dir in cache_base.iterdir():
        if version_dir.is_dir():
            graphs_dir = version_dir / "graphs"
            if graphs_dir.exists():
                results.append(graphs_dir)
    # Sort newest first so newer data takes precedence via seen_chunks dedup
    results.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return results


def process_multi_chunk_file(
    json_path: Path,
    match: re.Match,
    plane: int,
    plane_str: str,
    out_plane_dir: Path,
    seen_chunks: set,
    index: dict,
) -> tuple[int, int]:
    """Split a multi-chunk file into individual per-chunk output files.

    Returns (files_written, error_count).
    """
    start_x = int(match.group(1))
    start_y = int(match.group(2))
    end_x = int(match.group(3))
    end_y = int(match.group(4))

    files_written = 0
    errors = 0

    try:
        with open(json_path, "r") as f:
            data = json.load(f)

        nodes = parse_nodes(data["nodes"])
        paths = parse_paths(data["paths"])
        doors = parse_doors(data.get("doors", "")) if data.get("doors") else []

        if not nodes:
            return (0, 0)

        # Convert all nodes to global coords using start chunk offset
        offset_x, offset_y = chunk2coordinate(start_x, start_y)
        global_nodes = [(lx + offset_x, ly + offset_y) for lx, ly in nodes]

        # Assign each node to its correct chunk
        node_chunks = []
        for gx, gy in global_nodes:
            cx = (gx + SCOPE_X1) // CHUNK_SIDE
            cy = (SCOPE_Y2 - gy + CHUNK_SIDE - 1) // CHUNK_SIDE
            node_chunks.append((cx, cy))

        # Group nodes by chunk
        chunk_node_indices = defaultdict(list)
        for i, (cx, cy) in enumerate(node_chunks):
            chunk_node_indices[(cx, cy)].append(i)

        # Build edges from paths
        edges = paths_to_edges(paths)

        # For each chunk: remap node indices, keep only intra-chunk edges
        for (cx, cy), orig_indices in chunk_node_indices.items():
            chunk_key = f"{cx}-{cy}"
            dedup_key = (plane, chunk_key)
            if dedup_key in seen_chunks:
                continue

            # Remap: old index -> new index within this chunk
            old_to_new = {old: new for new, old in enumerate(orig_indices)}

            # Nodes for this chunk
            chunk_nodes = [[global_nodes[i][0], global_nodes[i][1]] for i in orig_indices]

            # Edges: keep only those where both endpoints are in this chunk
            chunk_edges = []
            for a, b in edges:
                if a in old_to_new and b in old_to_new:
                    chunk_edges.append([old_to_new[a], old_to_new[b]])

            result = {"nodes": chunk_nodes, "edges": chunk_edges}

            # Assign doors to this chunk by center coordinate
            if doors:
                chunk_doors = []
                for door in doors:
                    if not door["separating"]:
                        continue
                    dgx = door["center"][0] + offset_x
                    dgy = door["center"][1] + offset_y
                    dcx = (dgx + SCOPE_X1) // CHUNK_SIDE
                    dcy = (SCOPE_Y2 - dgy + CHUNK_SIDE - 1) // CHUNK_SIDE
                    if dcx == cx and dcy == cy:
                        chunk_doors.append([dgx, dgy])
                if chunk_doors:
                    result["doors"] = chunk_doors

            seen_chunks.add(dedup_key)
            out_path = out_plane_dir / f"{chunk_key}.json"
            with open(out_path, "w") as f:
                json.dump(result, f, separators=(",", ":"))

            index["chunks"][plane_str].append(chunk_key)
            index["stats"]["totalNodes"] += len(chunk_nodes)
            index["stats"]["totalEdges"] += len(chunk_edges)
            files_written += 1

        print(f"  Multi-chunk {json_path.name}: split into {files_written} chunks "
              f"({len(global_nodes)} nodes, {cx_cy_range(start_x, start_y, end_x, end_y)})")

    except Exception as e:
        errors += 1
        print(f"  ERROR: {json_path.name}: {e}")

    return (files_written, errors)


def cx_cy_range(sx, sy, ex, ey):
    """Format the chunk range for logging."""
    chunks = []
    for x in range(min(sx, ex), max(sx, ex) + 1):
        for y in range(min(sy, ey), max(sy, ey) + 1):
            chunks.append(f"{x}-{y}")
    return ", ".join(chunks)


def process_all(simba_root: Path, output_root: Path):
    """Process all cached graph JSONs and write web map files."""
    cache_dirs = find_cache_dirs(simba_root)
    if not cache_dirs:
        print(f"ERROR: No graph cache found in {simba_root / 'Data' / 'cache' / 'map'}")
        sys.exit(1)

    print(f"Found {len(cache_dirs)} cache director{'ies' if len(cache_dirs) > 1 else 'y'}:")
    for d in cache_dirs:
        print(f"  {d}")
    print(f"Writing to: {output_root}")

    # Single-chunk: {chunkX}-{chunkY}-{hash}.json
    # Multi-chunk: {startX}-{startY}_{endX}-{endY}-{hash}.json
    single_pattern = re.compile(r"^(\d+)-(\d+)-[a-f0-9]+\.json$")
    multi_pattern = re.compile(
        r"^(\d+)-(\d+)_(\d+)-(\d+)-[a-f0-9]+\.json$"
    )

    index = {"chunks": {}, "stats": {"totalNodes": 0, "totalEdges": 0}}
    total_files = 0
    error_count = 0
    seen_chunks = set()  # Track (plane, chunk_key) to avoid duplicates

    for graphs_dir in cache_dirs:
      for plane in range(4):
        plane_dir = graphs_dir / str(plane)
        if not plane_dir.exists():
            continue

        plane_str = str(plane)
        if plane_str not in index["chunks"]:
            index["chunks"][plane_str] = []

        out_plane_dir = output_root / str(plane)
        out_plane_dir.mkdir(parents=True, exist_ok=True)

        json_files = sorted(plane_dir.glob("*.json"))
        print(f"Plane {plane}: {len(json_files)} files")

        for json_path in json_files:
            match = single_pattern.match(json_path.name)
            if match:
                chunk_x = int(match.group(1))
                chunk_y = int(match.group(2))
            else:
                match = multi_pattern.match(json_path.name)
                if not match:
                    continue
                # Multi-chunk: split into individual per-chunk outputs
                written, errs = process_multi_chunk_file(
                    json_path, match, plane, plane_str,
                    out_plane_dir, seen_chunks, index,
                )
                total_files += written
                error_count += errs
                continue

            try:
                with open(json_path, "r") as f:
                    data = json.load(f)

                nodes = parse_nodes(data["nodes"])
                paths = parse_paths(data["paths"])
                doors = parse_doors(data.get("doors", "")) if data.get("doors") else []

                if not nodes:
                    continue

                result = convert_graph(nodes, paths, doors, chunk_x, chunk_y)

                chunk_key = f"{chunk_x}-{chunk_y}"
                dedup_key = (plane, chunk_key)
                if dedup_key in seen_chunks:
                    continue
                seen_chunks.add(dedup_key)

                out_path = out_plane_dir / f"{chunk_key}.json"

                with open(out_path, "w") as f:
                    json.dump(result, f, separators=(",", ":"))

                index["chunks"][plane_str].append(chunk_key)
                index["stats"]["totalNodes"] += len(result["nodes"])
                index["stats"]["totalEdges"] += len(result["edges"])
                total_files += 1

            except Exception as e:
                error_count += 1
                print(f"  ERROR: {json_path.name}: {e}")

    # Sort chunk lists for deterministic output
    for plane_str in index["chunks"]:
        index["chunks"][plane_str].sort()

    # Write index
    index_path = output_root / "index.json"
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    print(f"\n=== Conversion Complete ===")
    print(f"Files written: {total_files}")
    print(f"Errors: {error_count}")
    print(f"Total nodes: {index['stats']['totalNodes']:,}")
    print(f"Total edges: {index['stats']['totalEdges']:,}")
    print(f"Index: {index_path}")


def main():
    script_dir = Path(__file__).resolve().parent
    wasp_map_root = script_dir.parent
    simba_root = wasp_map_root.parent / "osrs-simba"

    output_root = wasp_map_root / "static" / "data_osrs" / "graphs"

    if not simba_root.exists():
        print(f"ERROR: osrs-simba not found at {simba_root}")
        sys.exit(1)

    output_root.mkdir(parents=True, exist_ok=True)
    process_all(simba_root, output_root)


if __name__ == "__main__":
    main()
