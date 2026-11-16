<div align="center">

# KHIPU MARS

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r170-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02?style=for-the-badge&logo=greensock&logoColor=white)](https://gsap.com/)
[![i18next](https://img.shields.io/badge/i18next-ES_%2F_EN_%2F_QU-26A69A?style=for-the-badge&logo=i18next&logoColor=white)](https://www.i18next.com/)
[![NASA Open APIs](https://img.shields.io/badge/NASA_Open_APIs-DONKI_%2F_MEDA_%2F_RAD-E03C31?style=for-the-badge&logo=nasa&logoColor=white)](https://api.nasa.gov/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](./LICENSE)

---

### Official Project Links

| Resource | Link |
| :--- | :--- |
| **Live Production Deployment** | [**https://khipu-mars.tech**](https://khipu-mars.tech) |
| **Official Demo Video** | [**Watch KHIPU MARS Demo Video**](https://youtu.be/IQAbXjYqoKg) |

</div>

---

## Demo Video

<div align="center">
  <a href="https://youtu.be/IQAbXjYqoKg" target="_blank">
    <img src="https://img.shields.io/badge/WATCH_DEMO_VIDEO-KHIPU_MARS-EA580C?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch KHIPU MARS Demo Video" />
  </a>
</div>

---

## Project Overview

**KHIPU MARS** is an educational 3D web-based space survival simulator developed for the **NASA Space Apps Challenge 2026**, specifically designed for children aged **7 to 12** (fully responsive across desktop PCs, mobile phones, and touch tablets).

The game bridges two worlds of engineering and survival management:
1. **Real NASA and ESA Space Science:** Powered by authentic historical Martian weather data (**Perseverance / MEDA**), solar particle storms (**NASA DONKI** and **Curiosity / RAD**), solar array physics (**InSight**), closed-loop water recycling and life support (**ISS ECLSS**), atmospheric oxygen generation (**MOXIE**), and space hydroponics (**NASA OSDR VEG-05 and XROOTS**).
2. **Ancient Andean Wisdom (*Khipu* and *Tambo*):** Instead of overwhelming children with complex scientific units, the colony uses the **Khipu Mission Ledger** (an interactive 3D Khipu of glowing cords and knots) to visually track the balance between **Water, Oxygen, Energy, Crops, and Radiation** inside the **MARS-EF03 (Tambo Alfa)** habitat.

---

## Storytelling & Cinematic Intro (4 First-Person Scenes)

When launching **KHIPU MARS**, players experience a movie-style cinematic sequence (`2.35:1 Letterbox`) featuring a real-time 3D camera, a first-person astronaut helmet visor, and a procedural space soundtrack synthesized with the **Web Audio API**, available in **Spanish, English, and Quechua (Runasimi)**:

1. **Scene 1 — Launch of the Future:**
   - *Visual:* First-person descent toward the **MARS-EF03** habitat shining across the red desert of Jezero Crater under an orange Martian sky.
   - *Narrative:* *"Year 2038. CHAPEA-3 Mission. Four astronauts land on Mars with one goal: prove humans can survive 500 sols on the Red Planet."*
2. **Scene 2 — The Incident:**
   - *Visual:* Red alert on the cargo module; a sudden dust storm batters the exterior containers while the 4 astronauts rush toward the habitat airlock.
   - *Narrative:* *"Landing alert! A sudden dust storm damages the cargo pod, scattering vital supplies. The crew rushes inside the habitat."*
3. **Scene 3 — The Countdown (The NASA–ESA Connection):**
   - *Visual:* Interactive orbital map showing an **ESA** supply capsule descending slowly from Martian orbit toward the crater while the **Chaski** antenna maintains the link.
   - *Narrative:* *"Earth hears you, but help is far away. An orbiting ESA supply capsule will reach your base in 28 sols."*
4. **Scene 4 — Your Mission (Khipu Activation):**
   - *Visual:* The **Khipu Mission Ledger** powers on in front of the 4 crew specialists.
   - *Narrative:* *"Every choice counts. Use the Khipu to balance power, water, crops, and radiation. Your challenge: survive all 28 sols."*

---

## Playable Specialist Roles & Random Role Assignment

Before starting Day 1, players can either choose one of the **4 crew specialties** or select the **Random Role** option (which randomly assigns a specialty and displays an **"Assigned role: X"** badge). Every action in the game clearly explains **The Benefit**, **The Cost (resource trade-off)**, and **Your Role Perk**:

| Role | 3D Badge | Colony Responsibility | Special Simulation Perk |
| :--- | :--- | :--- | :--- |
| **Commander** | Orange | Leads the mission and coordinates high-stakes decisions during colony emergencies. | Saves extra oxygen and energy when organizing the crew during crisis events. |
| **Engineer** | Yellow | Repairs machinery, sweeps solar arrays, and seals the water recycler. | Consumes less scrap and recovers **+35% bonus energy** when cleaning solar panels or repairing pipes. |
| **Medic** | Red / Green | Protects astronaut health and monitors habitat radiation shielding. | Reduces accumulated radiation faster and boosts crew recovery inside the shelter. |
| **Scientist** | Blue | Explores Jezero Crater with the Rover and cultivates crops in the greenhouse. | Greenhouse crops grow **+30% faster** and the Rover extracts extra water ice and minerals. |
| **Random Role** | Cyan | Randomly assigns any of the 4 specialties via the mission computer. | Displays the **"Assigned role: X"** banner and grants the full perk of the drawn specialist. |

---

## Level Structure: The 4 Acts (28 Sols) & Crisis Events

The full campaign spans **28 Sols (Martian days)** divided into **4 Acts of 7 Sols each**, calibrated against the real historical solar storm record of May–June 2024:

```mermaid
flowchart LR
    A["Act I (Sols 1-7)<br/>Landing & Greenhouse Setup"] --> B["Act II (Sols 8-14)<br/>Dust Storm & Solar Flare Peak"]
    B --> C["Act III (Sols 15-21)<br/>Jezero Crater Exploration"]
    C --> D["Act IV (Sols 22-28)<br/>Final Harvest & ESA Arrival"]
```

### Mission Levels / Acts
- **Level 1 — Act I (Sols 1 to 7): Landing, Interactive Tutorial & Initial Greenhouse**
  - Includes a guided **4-step Interactive Tutorial**.
  - Initializes the space greenhouse, calibrates solar arrays, and weathers the first wind gusts in Jezero Crater (**Sol 4**).
- **Level 2 — Act II (Sols 8 to 14): Dust Storm, Water Leak & Super Solar Storm**
  - **Sol 8 & Sol 12:** `25 m/s` wind gusts and a regional dust storm coat the solar cells (**Event A**).
  - **Sol 10:** A valve failure in the water recycler triggers the red emergency beacon (**Event B**).
  - **Sol 13:** Historical solar particle impact (**Event C**, based on the real `8,100 µGy/day` peak measured by *Curiosity/RAD* on May 20, 2024).
- **Level 3 — Act III (Sols 15 to 21): Recovery & Perseverance Rover Expeditions**
  - **Sol 16:** Passing *Dust Devils* allow the crew to clean solar panels and recover power if angled properly (**Event D**).
  - **Sol 18 & Sol 20:** Critical life-support maintenance and Rover expeditions into the ancient Jezero lake delta to harvest water ice.
- **Level 4 — Act IV (Sols 22 to 28): Hydroponic Harvest & ESA Capsule Rendezvous**
  - **Sol 22 & Sol 24:** Final solar alert and stabilization of the habitat's closed-loop ecosystem until achieving victory on **Sol 28**.

---

## Role of the 3D Khipu (`KhipuController.ts`)

The `khipu-tracker.glb` model renders in real time in the right-hand side panel (or expandable drawer on mobile devices) and translates the mathematical state of the base into an intuitive visual system for children:
- **4 Main Pendant Cords:** *Food/Crops*, *Energy*, *Radiation Alert*, and *Water/Supplies*.
- **20 Resource Knots (`Knot_[Resource]_L1` to `L5`):** Each knot represents **20%**. When a resource is at `60%`, knots `L1..L3` glow at full scale `(1, 1, 1)` while knots `L4..L5` dim and shrink to `(0.35, 0.35, 0.35)`.
- **4 Act Knots (`Act_Knot_01` to `04`):** Light up along the top master cord as the player progresses through the 4 Acts of the mission.

---

## 3D Graphics Engine, Collisions & Physical Task Simulation

Unlike a static button-clicking menu game, **KHIPU MARS** is a living 3D simulation:

1. **7 Custom 3D Models (`.glb`) in `/public/models/`:**
   - `jezero-terrain.glb`: Jezero Crater terrain with shadow reception, boundary clamping, and raycast height sampling.
   - `tambo-alfa.glb`: Central **MARS-EF03** habitat, agricultural dome, and greenhouse with a continuously rotating `Chaski_Antenna_Dish`.
   - `solar-panels-array.glb`: Two solar arrays (East and West) whose solar cells (`Mat_Celda_Solar`) dynamically shift from clean blue to dusty reddish-brown during Martian dust storms.
   - `mars-rover.glb`: Explorer Rover with 6 articulated wheels, camera mast, and robotic arm for extracting water ice and minerals.
   - `external-equipment.glb`: Water recycler with an emergency status beacon (`Recycler_Status_Beacon`) and MEDA weather station with a spinning anemometer.
   - `astronaut-character.glb`: Main Astronaut (controlled by the player) + **3 autonomous NPC Specialists** (*Engineer*, *Scientist*, and *Medic*).
   - `khipu-tracker.glb`: Interactive 3D Khipu with an Inti sun medallion.
2. **Solid Collisions, Terrain Clamping & Smooth Follow Camera:**
   - Vertical sampling via `THREE.Raycaster` (`sampleTerrainHeight`) ensures no character, building, or vehicle ever floats or sinks into the ground, while strict terrain bounds prevent walking off the map.
   - Smooth third-person camera damping automatically follows the astronaut as they walk across the colony.
   - 2D cylindrical collision resolution (`resolvePositionWithCollisions`) with tangential sliding prevents characters from walking through buildings, solar panels, the Rover, or other astronauts.
3. **Physical Task Execution & NPC Teamwork:**
   - When selecting any task (*Water Crops*, *Harvest*, *Sweep Solar Panels*, *Repair Water Recycler*, *Deploy Rover*), the astronaut (or Rover) **physically walks to the station accompanied by the corresponding NPC specialist**.
   - Upon arrival, they perform real-time procedural work animations (`SWEEPING_PANELS`, `REPAIRING_PIPES`, `WATERING_CROPS`, `SCANNING_ROCKS`) with 3D particle effects and a live progress bar before resources are updated.
   - The 3 NPCs patrol their specialty stations, greet each other when crossing paths, and offer helpful tips when the player approaches them.
4. **Smart Desktop vs. Mobile Adaptation:**
   - On touch mobile and tablet devices, an ergonomic **virtual D-Pad / thumb joystick** and multi-touch camera gestures (`1 finger: rotate`, `2 fingers: zoom/pan`) are enabled.
   - On desktop PCs, the virtual joystick **is automatically hidden**, prioritizing direct click-to-move (*Tap-to-Move*) on the Martian ground and `WASD` keyboard controls.

---

## Project Architecture

```text
khipu-mars/
├── public/
│   └── models/                  # 7 3D models (.glb) of Jezero Crater, Habitat, Rover, Astronauts & Khipu
├── src/
│   ├── core/
│   │   ├── constants.ts         # NASA scientific parameters, Blender node names & Beer-Lambert law
│   │   └── types.ts             # Global TypeScript interfaces for telemetry, resources, roles & events
│   ├── locales/
│   │   ├── i18n.ts              # Trilingual i18next configuration
│   │   ├── es.json              # Spanish localization (tailored for ages 7 to 12)
│   │   ├── en.json              # English localization
│   │   └── qu.json              # Quechua (Runasimi) localization
│   ├── services/
│   │   └── NasaDataService.ts   # Live NASA API (DONKI) client + 28-Sol offline historical dataset
│   ├── simulation/
│   │   ├── ResourceEngine.ts    # Mathematical engine: R(t+1) = R(t) + P(t) - C(t) - L(t)
│   │   └── EventSystem.ts       # Crisis Events A, B, C, D & role-based contextual specialist menus
│   ├── world/
│   │   ├── AssetLoader.ts       # Progressive GLB loader with LoadingManager & shadow configuration
│   │   ├── AnimationController.ts # Procedural limb animations for walking, sweeping, repairing & Rover
│   │   ├── InputManager.ts      # Unified PointerEvents raycasting, hitboxes & keyboard shortcuts
│   │   ├── TouchNavigation.ts   # Collisions, terrain bounds, NPC AI & real-time physical task execution
│   │   └── SceneManager.ts      # Three.js scene, lighting, Martian fog & GSAP follow/cinematic cameras
│   ├── ui/
│   │   ├── icons.ts             # SVG vector icon library & role illustrations
│   │   ├── KhipuController.ts   # Interactive 3D Khipu viewer & 20-knot state synchronization
│   │   └── index.ts             # 4-scene cinematic intro, interactive tutorial, HUD & Web Audio API
│   ├── main.ts                  # Application entry point
│   └── style.css                # Tailwind CSS styles & mobile-first touch rules
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── LICENSE                      # MIT License
```

---

## Local Installation & Setup

### 1. Clone the repository and install dependencies
```bash
git clone https://github.com/YOUR_USERNAME/khipu-mars.git
cd khipu-mars
npm install
```

### 2. Configure the NASA API Key (Optional)
The game works **100% offline** out of the box thanks to its pre-calibrated 28-Sol historical dataset and uses `DEMO_KEY` by default. If you wish to connect your own free API key from [api.nasa.gov](https://api.nasa.gov/), create a `.env` file in the project root:

```env
VITE_NASA_API_KEY=YOUR_NASA_API_KEY
```

### 3. Start the development server
```bash
npm run dev
```

### 4. Build for production (Vercel / Netlify / GitHub Pages)
```bash
npm run build
npm run preview
```

---

## License

This project is distributed under the **MIT License**. See the [LICENSE](./LICENSE) file for the full legal text.
