#!/usr/bin/env python3
"""regions.yaml -> data/regions.json

The page loads the JSON. Re-run this after editing the YAML.
Requires PyYAML: uv run --with pyyaml python scripts/build_regions.py
"""

import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: uv run --with pyyaml python scripts/build_regions.py")

root = Path(__file__).resolve().parent.parent
source = root / "regions.yaml"
dest = root / "data" / "regions.json"

data = yaml.safe_load(source.read_text())
dest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {dest}")
