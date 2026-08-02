#!/usr/bin/env python3
"""
Applies TellyBase's required Android/iOS platform configuration on top of a
freshly-generated `flutter create .` project.

Why this exists: `flutter create .` refuses to overwrite files that already
exist (unless given --overwrite, which would blow away the generated
AndroidManifest.xml/Info.plist entirely and is not what we want). So instead
of committing android/ and ios/ platform folders to git (which is fragile —
they must match whatever Flutter/AGP/Xcode version the CI machine has), this
repo commits only the *deltas* TellyBase actually needs
(ci/android_manifest_additions.xml, ci/ios_info_plist_additions.xml) and this
script merges them into the generated project right after `flutter create .`
runs, every single build. See codemagic.yaml for where this is invoked.
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def merge_android_manifest() -> None:
    manifest_path = ROOT / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    additions_path = ROOT / "ci" / "android_manifest_additions.xml"

    if not manifest_path.exists():
        print(f"[apply_platform_config] SKIP: {manifest_path} not found "
              f"(did `flutter create .` run first?)")
        return

    ns = "http://schemas.android.com/apk/res/android"
    ET.register_namespace("android", ns)

    manifest_tree = ET.parse(manifest_path)
    manifest_root = manifest_tree.getroot()

    additions_root = ET.parse(additions_path).getroot()

    existing_permissions = {
        el.get(f"{{{ns}}}name")
        for el in manifest_root.findall("uses-permission")
    }

    inserted = 0
    # Insert <uses-permission> elements (in document order) right before the
    # first <application> tag, matching where `flutter create` normally
    # places any manually-added permissions.
    application_el = manifest_root.find("application")
    insert_index = list(manifest_root).index(application_el) if application_el is not None else len(list(manifest_root))

    for el in additions_root.findall("uses-permission"):
        name = el.get(f"{{{ns}}}name")
        if name in existing_permissions:
            continue
        manifest_root.insert(insert_index, el)
        insert_index += 1
        inserted += 1

    # Merge <application> attributes (e.g. usesCleartextTraffic) without
    # touching the <activity>/<meta-data> children Flutter generated.
    additions_app = additions_root.find("application")
    if additions_app is not None and application_el is not None:
        for attr_name, attr_value in additions_app.attrib.items():
            application_el.set(attr_name, attr_value)

    manifest_tree.write(manifest_path, encoding="utf-8", xml_declaration=True)
    print(f"[apply_platform_config] AndroidManifest.xml: inserted {inserted} new permission(s).")


def merge_ios_info_plist() -> None:
    plist_path = ROOT / "ios" / "Runner" / "Info.plist"
    additions_path = ROOT / "ci" / "ios_info_plist_additions.xml"

    if not plist_path.exists():
        print(f"[apply_platform_config] SKIP: {plist_path} not found "
              f"(did `flutter create .` run first?)")
        return

    plist_text = plist_path.read_text()
    additions_text = additions_path.read_text()

    # Pull out every <key>...</key><value-element>...</value-element> (or
    # self-closing) pair from the additions file, in source order.
    entry_pattern = re.compile(
        r"<key>(?P<key>[^<]+)</key>\s*(?P<value>"
        r"<string>.*?</string>"
        r"|<array>.*?</array>"
        r"|<true/>|<false/>"
        r"|<integer>.*?</integer>"
        r")",
        re.DOTALL,
    )
    entries = entry_pattern.findall(additions_text)
    if not entries:
        print("[apply_platform_config] WARNING: no plist entries parsed from additions file.")
        return

    added = 0
    for key, value in entries:
        key = key.strip()
        if f"<key>{key}</key>" in plist_text:
            continue
        insertion = f"\t<key>{key}</key>\n\t{value.strip()}\n"
        # Insert right after the opening <dict> of the top-level plist.
        plist_text = plist_text.replace("<dict>", "<dict>\n" + insertion, 1)
        added += 1

    plist_path.write_text(plist_text)
    print(f"[apply_platform_config] Info.plist: added {added} new key(s).")


if __name__ == "__main__":
    merge_android_manifest()
    merge_ios_info_plist()
    print("[apply_platform_config] Done.")
