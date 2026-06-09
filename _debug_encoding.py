import json

# Read CSV raw bytes
with open('csv/weapons.csv', 'rb') as f:
    raw = f.read()
print('CSV first 30 bytes hex:', raw[:30].hex())
print('CSV has BOM:', raw[:3] == b'\xef\xbb\xbf')

# Find plasma line
lines = raw.split(b'\n')
for i, l in enumerate(lines):
    if l.startswith(b'plasma'):
        parts = l.split(b',')
        print(f'plasma id: {parts[0]}')
        name_hex = parts[1].hex() if len(parts) > 1 else 'NA'
        print(f'plasma name hex: {name_hex}')
        try:
            name = parts[1].decode('utf-8')
            print(f'plasma name decoded: {repr(name)}')
        except Exception as e:
            print(f'plasma name decode error: {e}')
        break

# Read JSON
with open('src/data/weapons.json', 'rb') as f:
    raw_j = f.read()

# Find plasma in JSON
idx = raw_j.find(b'plasma')
if idx >= 0:
    chunk = raw_j[idx:idx+200]
    name_idx = chunk.find(b'"name"')
    if name_idx >= 0:
        name_chunk = chunk[name_idx:name_idx+80]
        print(f'JSON name chunk: {name_chunk}')
        try:
            s = name_chunk.decode('utf-8')
            print(f'JSON name decoded: {repr(s)}')
        except Exception as e:
            print(f'JSON name decode error: {e}')

# Load full JSON
with open('src/data/weapons.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(f'First weapon from JSON: id={repr(data[0]["id"])}, name={repr(data[0]["name"])}')
print(f'Second weapon: id={repr(data[1]["id"])}, name={repr(data[1]["name"])}')
