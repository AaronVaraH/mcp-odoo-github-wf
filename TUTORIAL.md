# Tutorial de Conexión: Odoo + MCP Git Workflow

Esta guía te explica paso a paso cómo conectar tu instancia de **Odoo** (por ejemplo `https://odoo.tuempresa.com` o `https://tu-instancia.odoo.com`) con el servidor MCP `mcp-odoo-git-workflow` para que tu asistente de IA (Cursor, Windsurf, Claude Desktop, Antigravity) pueda sincronizar tareas, crear ramas de Git y documentar tu código automáticamente.

---

## Datos Requeridos

Para que el servidor MCP se comunique con Odoo, necesitas 4 variables de entorno:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `ODOO_URL` | URL de tu servidor Odoo | `https://odoo.tuempresa.com` o `https://tu-instancia.odoo.com` |
| `ODOO_DB` | Nombre de la base de datos | `mi_empresa_db` |
| `ODOO_USER` | Tu correo o usuario de inicio de sesión | `tu_correo@tuempresa.com` |
| `ODOO_API_KEY` | Clave secreta de API generada en tu perfil | `9a1b2c3d4e5f...` |

> **Nota sobre la URL:** Puedes ingresar la URL completa con `/odoo` o `/web` (ej. `https://odoo.tuempresa.com/odoo`). El servidor MCP normaliza automáticamente la URL a la raíz para que el protocolo XML-RPC funcione sin errores.

---

## Paso a Paso: Obtención de Credenciales

### Paso 1: Localizar el Nombre de tu Base de Datos (`ODOO_DB`)

En la mayoría de las instalaciones corporativas de Odoo, el nombre de la base de datos suele coincidir con el identificador de la empresa o subdominio.

Para confirmarlo de forma precisa:
1. Abre tu navegador e ingresa a tu instancia de Odoo (ej. `https://odoo.tuempresa.com`).
2. Si tienes varias bases de datos o abres una ventana de incógnito en `https://odoo.tuempresa.com/web/database/selector`, verás el listado con el nombre exacto de la base de datos activa.
3. Si ya iniciaste sesión, a menudo se observa en la consola de desarrollador del navegador o en la cookie de sesión como `db=...`.

---

### Paso 2: Generar tu Clave de API Personal (`ODOO_API_KEY`)

Odoo cuenta con un sistema nativo de **Claves de API de Desarrollador** (disponible a partir de Odoo 14). Permite que el MCP opere con tus mismos permisos sin tener que compartir tu contraseña real y es 100% compatible con cuentas corporativas que usan Google Workspace, Microsoft SSO o 2FA.

Sigue estos pasos en tu navegador:

1. **Inicia sesión** en tu cuenta de Odoo:
   `https://odoo.tuempresa.com`

2. Haz clic en tu **foto o nombre de usuario** en la esquina superior derecha:
   - En el menú desplegable, selecciona **"Preferencias"** (o *"Mi Perfil"*).

3. En la ventana emergente, ve a la pestaña **"Seguridad de la cuenta"** (*Account Security*).

4. Busca la sección **"Claves de API de desarrollador"** y haz clic en el botón **"Nueva clave de API"**:
   - Asigna un nombre identificador (por ejemplo: `MCP Git Workflow`).
   - Haz clic en **"Generar clave"**.
   - Si Odoo te solicita tu contraseña para confirmar, ingrésala.

5. **¡Copia la clave de inmediato!**  
   Odoo te mostrará una cadena alfanumérica única. Guárdala en un lugar seguro; por motivos de seguridad, Odoo nunca la vuelve a mostrar en pantalla.

---

## Paso 3: Configurar las Credenciales

Elige la opción que prefieras según tu entorno de trabajo:

### Opción A: Archivo `.env` en la raíz de tu proyecto
Crea un archivo llamado `.env` en la carpeta donde tienes tu repositorio:

```env
ODOO_URL=https://odoo.tuempresa.com
ODOO_DB=mi_empresa_db
ODOO_USER=tu_correo@tuempresa.com
ODOO_API_KEY=tu_clave_de_api_generada
```

---

### Opción B: En la configuración de tu editor MCP

#### 1. En Cursor / Windsurf (`mcp.json` o en Settings -> Features -> MCP Servers):
```json
{
  "mcpServers": {
    "odoo-workflow": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/dist/index.js"],
      "env": {
        "ODOO_URL": "https://odoo.tuempresa.com",
        "ODOO_DB": "mi_empresa_db",
        "ODOO_USER": "tu_correo@tuempresa.com",
        "ODOO_API_KEY": "tu_clave_de_api_generada"
      }
    }
  }
}
```

> **Nota para Windows:** En `args`, usa barras diagonales normales `/` o duplica las barras invertidas `\\`, por ejemplo: `"C:/Dev/mcp-odoo-github-wf/dist/index.js"` o `"C:\\Dev\\mcp-odoo-github-wf\\dist/index.js"`.

#### 2. En Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "odoo-workflow": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/dist/index.js"],
      "env": {
        "ODOO_URL": "https://odoo.tuempresa.com",
        "ODOO_DB": "mi_empresa_db",
        "ODOO_USER": "tu_correo@tuempresa.com",
        "ODOO_API_KEY": "tu_clave_de_api_generada"
      }
    }
  }
}
```

---

## Paso 4: Validar la Conexión con `validate_environment`

Una vez configuradas las variables, tu agente de IA puede invocar en cualquier momento la herramienta:

```json
{
  "tool": "validate_environment"
}
```

Esta herramienta te responderá:
- **Odoo**: Si el servidor respondió, la versión de Odoo (ej. `17.0`) y el nombre del usuario autenticado (ej. `Tu Nombre de Usuario`).
- **Git / GitHub**: Si la carpeta actual es un repositorio Git, la rama activa, tu usuario de Git y si hay un remoto enlazado a GitHub.

---

## Preguntas Frecuentes y Solución de Problemas

#### 1. ¿Qué pasa si mi empresa usa Google Workspace / Microsoft SSO para entrar a Odoo?
Las Claves de API de Odoo funcionan **perfectamente con SSO y 2FA**, ya que están diseñadas precisamente para que herramientas externas y scripts se autentiquen sin depender del formulario web.

#### 2. ¿Tengo que configurar las credenciales cada vez que cambie de rama o proyecto?
Si colocas las variables en el archivo de configuración de tu editor (`mcp.json` o `claude_desktop_config.json`), estarán disponibles para **todos tus proyectos** de manera permanente.

#### 3. Error: *"Access Denied"* o *"Failed to authenticate with Odoo"*
- Revisa que el nombre de la base de datos (`ODOO_DB`) sea exactamente el correcto.
- Verifica que el usuario (`ODOO_USER`) coincida con el email con el que generaste la clave de API.
- Comprueba que la clave de API copiada no tenga espacios en blanco al inicio o al final.
