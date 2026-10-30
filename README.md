# Ghost AI

App de IA en Windows flotante y discreta, con soporte para consultas rápidas de texto en pantalla, lectura de documentos, memoria conversacional, renderizado de Markdown offline, control de opacidad y sincronización remota.

## Créditos
- Autor original: **Ariel Espinoza**
- Edición y mejoras: **Máximo Gómez**

## Características
- **Modo No-Foco (Sigiloso)**: Ventana flotante con flags nativos para interactuar sin perder el foco en otras aplicaciones.
- **Preguntar lo Seleccionado**: Resalta cualquier texto en pantalla y presiona el botón para consultar sin tocar el teclado.
- **Soporte Multi-Documento**: Arrastra o selecciona PDFs, apuntes o textos de referencia.
- **Modelos IA**: Compatible con Google Gemini 3.5 Flash, Gemini 3.8 Flash (con thinking budget) y Antigravity Suite.
- **Tema Claro / Oscuro**: Alternador monocromático de contraste adaptativo.
- **Renderizado Markdown Offline**: Tablas, bloques de código, listas y fórmulas formateadas prolijamente con `marked.min.js`.
- **Atajos Globales de Teclado**:
  - `Ctrl + Shift + H`: Mostrar u ocultar la ventana.
  - `Ctrl + Shift + A`: Consultar el contenido del portapapeles.
  - `Ctrl + Shift + Space`: Alternar modo teclado / modo sin foco.

## Configuración de API Key
1. Obtén tu API Key gratuita en [Google AI Studio](https://aistudio.google.com/apikey).
2. Abre Ghost AI y presiona el botón de ajustes / API Key arriba a la derecha para guardarla.

## Uso en desarrollo
```bash
npm install
npm start
```

Para generar los instaladores ejecutables:
```bash
npm run build
```
