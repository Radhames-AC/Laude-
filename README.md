# 📚 Teacher Gradebook & Lesson Planner

Una aplicación web Single Page Application (SPA) moderna diseñada para que los profesores gestionen sus planificaciones de clases (Lesson Planner), registren asistencia y calificaciones diarias (Record Log/Tracker), y visualicen analíticas de rendimiento de sus estudiantes en tiempo real (Record Book).

## 🚀 Tecnologías Utilizadas (Tech Stack)

*   **Core:** React 18+
*   **Lenguaje:** TypeScript (Tipado estático estricto)
*   **Build Tool:** Vite (Empaquetador ultrarrápido y HMR)
*   **Estilos:** Tailwind CSS (Utility-first CSS framework)
*   **Iconografía:** Lucide React

## 🏗 Arquitectura del Sistema

La aplicación sigue un patrón de **Arquitectura Basada en Componentes** con una estricta **Separación de Preocupaciones (Separation of Concerns)** y un modelo de datos jerárquico.

### Modelo de Datos (Single Source of Truth)
El sistema no duplica calificaciones. Todo se calcula en tiempo real a partir de los registros diarios.
1.  **`Topic` (Lección):** Contenedor principal del diseño instruccional. Pertenece a un Cuatrimestre y a una Sección.
2.  **`Session` (Día de Clase):** Instancia de un `Topic` en una fecha específica.
3.  **`StudentRecord` (Registro Individual):** Unidad atómica de datos por estudiante (Asistencia, Participación, Comportamiento, Trabajo en Clase, Tarea, Ajustes y Quizzes).

### Motor de Calificaciones (`src/gradingUtils.ts`)
Toda la lógica matemática está desacoplada en funciones puras. El sistema de calificación es dinámico y responde a la configuración del profesor (`TeacherSettings`):
*   **Nota de Sesión (Session Score):** Escala los valores brutos (ej. 8/10 en participación) según los pesos configurados (ej. Participación = 10%, Trabajo en Clase = 25%, etc.).
*   **Nota de Lección (Topic Score):** Promedio de Sesiones (ej. 60%) + Promedio de Quizzes (ej. 40%).
*   **Nota Trimestral (Quarter Grade):** Promedio de todas las notas de lecciones en un cuatrimestre.
*   **Límites Dinámicos (Caps):** Las notas máximas se calculan dinámicamente (`100 + peso_de_ajustes`) para permitir puntos extra sin romper la escala matemática.

## 📂 Estructura del Proyecto

```text
/
├── public/                 # Assets estáticos
├── src/
│   ├── components/         # Componentes de la interfaz de usuario (UI)
│   │   ├── AnalyticsTab.tsx  # Record Book y visualización de datos
│   │   ├── DashboardTab.tsx  # Vista general y alertas de rendimiento
│   │   ├── PlannerTab.tsx    # Gestión de lecciones (CMS ligero)
│   │   ├── SettingsTab.tsx   # Configuración de pesos y catálogos
│   │   └── TrackerTab.tsx    # Cuadrícula de registro diario
│   ├── types.ts            # Definiciones de interfaces y tipos de TypeScript
│   ├── gradingUtils.ts     # Lógica pura de cálculo de calificaciones
│   ├── App.tsx             # Componente raíz y enrutador interno
│   ├── main.tsx            # Punto de entrada de React
│   └── index.css           # Estilos globales y directivas de Tailwind
├── index.html              # Plantilla HTML principal
├── package.json            # Dependencias y scripts
├── tailwind.config.js      # Configuración de Tailwind CSS
├── tsconfig.json           # Configuración de TypeScript
└── vite.config.ts          # Configuración de Vite
```

## 💻 Instalación y Desarrollo Local

Sigue estos pasos para ejecutar el proyecto en tu máquina local:

### Requisitos Previos
*   Node.js (versión 18 o superior)
*   npm o yarn

### Pasos

1.  **Clonar el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd teacher-gradebook
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Iniciar el servidor de desarrollo:**
    ```bash
    npm run dev
    ```
    La aplicación estará disponible en `http://localhost:3000` (o el puerto que Vite asigne).

4.  **Compilar para producción:**
    ```bash
    npm run build
    ```
    Los archivos estáticos optimizados se generarán en la carpeta `/dist`, listos para ser desplegados en plataformas como Vercel, Netlify o Firebase Hosting.

## 🛠 Próximos Pasos (Roadmap)
*   [ ] Integración con Backend as a Service (BaaS) como Firebase o Supabase para persistencia de datos en la nube.
*   [ ] Implementación de un gestor de estado global (Zustand o Redux Toolkit) para optimizar el flujo de datos.
*   [ ] Funcionalidad de exportación a PDF y CSV/Excel para reportes administrativos.
*   [ ] Virtualización de listas en el Gradebook para manejar miles de registros sin pérdida de rendimiento.
