import zipfile
import xml.etree.ElementTree as ET

docx_path = r'C:\Users\ariel\.gemini\antigravity\brain\0428de03-284a-4707-aa99-68f13e4a5b83\.user_uploaded\media_1793156323675_231e4eb1.docx'

try:
    with zipfile.ZipFile(docx_path) as z:
        xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        texts = []
        for elem in tree.iter():
            if elem.tag.endswith('}t'):
                texts.append(elem.text or '')
        full_text = ' '.join(texts)
        print("Length of docx text:", len(full_text))
        if 'PANAN' in full_text or 'avión' in full_text or 'avion' in full_text:
            print("Found PANAN in docx!")
            idx = full_text.find('PANAN')
            print(full_text[max(0, idx-100):idx+500])
        else:
            print("PANAN not in docx.")
            print("Docx preview:", full_text[:500])
except Exception as e:
    print("Error:", e)
