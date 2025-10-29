#!/usr/bin/env python3

# Copyright (c) 2025 Eclipse Foundation
"""
Validate all JSON files under `ips/` against the provided `cfg/schema.json`.

Usage:
  python3 scripts/validate_ips.py         # prints results, returns non-zero on error
  python3 scripts/validate_ips.py --strict  # fail on unknown properties

This script uses the `jsonschema` package (pip install jsonschema).
"""
import argparse
import glob
import json
import sys
from pathlib import Path

try:
    import jsonschema
except Exception:
    print("Missing dependency: run `pip install jsonschema` first.")
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / 'cfg' / 'schema.json'

def load_schema(strict=False):
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as fh:
        schema = json.load(fh)
    if strict:
        # create a copy where each item disallows additionalProperties
        schema = dict(schema)
        item = dict(schema.get('items', {}))
        item['additionalProperties'] = False
        schema['items'] = item
    return schema

def validate_file(path, schema):
    with open(path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    # use jsonschema validator (Draft7) which is declared in schema
    resolver = jsonschema.RefResolver(base_uri=f'file://{SCHEMA_PATH}', referrer=schema)
    validator = jsonschema.Draft7Validator(schema, resolver=resolver)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    return errors

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--strict', action='store_true', help='Fail on unknown properties (additionalProperties=false)')
    args = parser.parse_args()
    if not SCHEMA_PATH.exists():
        print(f"Schema not found at {SCHEMA_PATH}")
        return 2
    schema = load_schema(strict=args.strict)
    # First, ensure the schema itself is a valid JSON Schema (Draft7)
    try:
        jsonschema.Draft7Validator.check_schema(schema)
        print(f'Schema {SCHEMA_PATH} appears to be a valid Draft7 JSON Schema')
    except Exception as e:
        print(f'Schema validation ERROR: {e}')
        return 2

    files = sorted(glob.glob(str(ROOT / 'ips' / '*.json')))
    any_errors = False
    for f in files:
        # skip the schema file itself from validation against the schema
        if Path(f).resolve() == SCHEMA_PATH.resolve():
            print(f'Skipping schema file {f}')
            continue
        print(f'Validating {f} ...', end=' ')
        try:
            errors = validate_file(f, schema)
        except Exception as e:
            print(f'ERROR parsing/validating: {e}')
            any_errors = True
            continue
        if not errors:
            print('OK')
        else:
            any_errors = True
            print(f'{len(errors)} error(s)')
            for err in errors:
                # human-friendly path
                loc = '.'.join([str(p) for p in err.path]) or '<root>'
                print(f'  - {loc}: {err.message}')

    if any_errors:
        print('\nOne or more files failed validation.')
        return 1
    print('\nAll ips/*.json files validate against ips/schema.json')
    return 0

if __name__ == '__main__':
    sys.exit(main())
