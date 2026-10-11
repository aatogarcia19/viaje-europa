# Europa 2027

App personal (PWA) para planear y recorrer nuestro viaje por Europa: itinerario por día, mapa con la ruta a pie, trenes y vuelos, audioguías, alojamientos, gastos compartidos y pendientes.

- Se instala en el iPhone desde Safari: **Compartir → Agregar a pantalla de inicio**.
- Funciona sin conexión; los cambios se sincronizan con Supabase cuando hay internet.
- El contenido del viaje no está en este repositorio: vive en la base de datos y se entra con el código del viaje.

Desarrollo: `npm install`, `npm run dev`. Cada push a `main` publica la app en GitHub Pages.

## Datos y servicios abiertos

App personal y sin fines comerciales (licencia MIT), usada por dos personas.

- **Rutas de transporte público**: [Transitous](https://transitous.org/) (API MOTIS), con datos abiertos de cada operador ([fuentes](https://transitous.org/sources/)). Uso ligero: una consulta por tramo, separadas por más de un segundo, y los resultados se guardan para no repetirlas.
- **Metro de Madrid**: enrutador propio con datos de © [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
- **Mapas**: [OpenFreeMap](https://openfreemap.org/), © OpenStreetMap; vista satelital de Esri World Imagery.
- **Caminatas**: OSRM de [routing.openstreetmap.de](https://routing.openstreetmap.de/).
- **Clima**: [Open-Meteo](https://open-meteo.com/).

Contacto: abrir un issue en este repositorio.
