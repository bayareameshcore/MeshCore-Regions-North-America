# MeshCore-Regions-North-America

Coordinating MeshCore regions in North America. `regions.yaml` is the tree.

Drop a pin on the map to get recommended repeater `region` commands. Tag nearby areas from the slug buttons. It does not choose frequency or bandwidth.

```bash
uv run --with pyyaml python scripts/build_regions.py
python3 -m http.server 8765
```

Open http://localhost:8765/ . Rebuild the JSON after editing the YAML.
