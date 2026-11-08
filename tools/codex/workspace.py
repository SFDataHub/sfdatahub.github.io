"""Python adapter for the shared JavaScript workspace and output guards."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

_helper = Path(__file__).with_suffix('.mjs').resolve()
_node = shutil.which('node') or shutil.which('node.exe')
if not _node:
    raise RuntimeError('Node is required for the shared Codex workspace resolver')


def _resolve(operation, value=None):
    helper = str(_helper)
    if _node.lower().endswith('.exe'):
        helper = re.sub(r'^/mnt/([a-z])/', lambda m: m[1].upper() + ':/', helper)
    command = [_node, helper, operation]
    if value is not None:
        command.append(str(value))
    result = json.loads(subprocess.check_output(command, text=True))
    if isinstance(result, str):
        if os.name != 'nt':
            result = re.sub(r'^([A-Za-z]):[\\/]', lambda m: '/mnt/' + m[1].lower() + '/', result).replace('\\', '/')
        return Path(result)
    return result


def artifact_path(relative):
    return _resolve('--artifact', relative)


def historical_path(relative):
    return _resolve('--historical', relative)
