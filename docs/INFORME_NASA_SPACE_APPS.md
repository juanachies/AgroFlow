# AgroFlow — Project Submission Report

**NASA Space Apps Challenge · AgTech Challenges for Argentina's Core Zone**
**Challenge 02:** Harvest and Post-Harvest Logistics Comprehensive Decision Assistant for the Humid Pampas

| | |
| --- | --- |
| **Live deployment** | https://agroflow-mctx.onrender.com |
| **Web app (Vercel)** | https://marcianos-hazel.vercel.app |
| **Repository** | https://github.com/juanachies/AgroFlow |
| **Presentations** | [Español](presentaciones/AgroFlow-presentacion.pptx) · [English](presentaciones/AgroFlow-presentation-en.pptx) |

---

## 1. Project Name

**AgroFlow — Queue-Free Harvest and Dispatch Decision Assistant & Logistics Marketplace for the Humid Pampas**

## 2. High-Level Project Summary

AgroFlow is an end-to-end decision-support system and logistics execution marketplace built on a hexagonal architecture to optimize harvest and post-harvest grain logistics in Argentina's Humid Pampas (Zona Núcleo, Challenge 02). During peak harvest, thousands of trucks converge on the same export terminals simultaneously: in May 2026 alone, over 850,000 trucks unloaded at the Gran Rosario port hub. Fragmented decisions on harvest timing, fleet contracting, destination choice and sale timing erode profitability through port queues, peak-season freight surcharges, field shattering and forced spot sales.

AgroFlow unites three pillars:

1. **Net-Margin Decision Simulator** for harvest windows, machinery sizing, destination allocation (direct-to-port, local elevator/cooperative, or on-farm silo bag) and spot/futures sale timing.
2. **Local Contractors & Fleet Marketplace** that turns the simulation plan into concrete bookings for combine harvesters, grain carts, baggers and trucks.
3. **Proprietary Day-by-Day Port Saturation Forecast** that cross-references official vessel line-ups against upcoming marketplace truck reservations before trucks hit the road, shifting dispatches to fluid windows while coexisting with existing terminal appointment systems (Circular and Muvin).

## 3. Detailed Project Description

### Problem statement and user context

Between physiological maturity and final commercialization, producers, agronomic advisors and cooperatives (such as AFA) face five interconnected operational decisions:

1. **Optimal harvest window.** Balancing grain moisture at delivery against natural header shattering and rainfall delays. INTA Manfredi trials show that delaying soybean harvest by 33 days raises yield losses from 56 to 264 kg/ha, whereas harvesting near 15% moisture cuts shattering losses in half.
2. **Machinery sizing and advance booking.** Calculating the exact number of combine harvesters, grain carts, baggers and trucks, choosing between dedicated daily truck charters (Modality A) and round-trip/ton-km tariffs (Modality B), and booking available local service providers.
3. **Grain destination allocation.** Comparing net margin (USD/t and USD/ha) across direct port shipment, local elevator/cooperative delivery or on-farm silo-bag storage under real road distances and port congestion.
4. **Dynamic silo-bag IoT monitoring and extraction.** Tracking internal CO₂, moisture and temperature via IoT sensors alongside INTA storage curves to trigger extraction and sale before spoilage outweighs market carry.
5. **Commercial sale timing (spot vs. futures).** Deciding whether to sell immediately at harvest or store/hedge using CAC Rosario spot reference prices, A3 futures curves and port shipping indices.

### Target users and operational roles

- **Producers and agronomists.** Manage multiple fields/lots (1st and 2nd crop soybean, early and late corn, wheat and sorghum across Santa Fe and the Humid Pampas), draw or import GeoJSON field boundaries on interactive maps, run net-margin simulations, book machinery/freight and monitor silo bags.
- **Contractors, transport operators and baggers (service providers).** Publish service offers (equipment type, capacity, pricing, geographic coverage, date availability) in the marketplace, receive plan assignments and evaluate profitability by distance and expected terminal queue time.
- **Cooperatives and exporters (B2B2C expansion).** Use aggregated pre-departure truck reservation visibility to smooth terminal inflows alongside Circular and Muvin slot systems.

### System architecture and modular components

AgroFlow is implemented in Node.js (v22.23.5) and Python using a **hexagonal architecture**: all core business rules reside in `src/domain` with zero network or framework dependencies, and communicate with external APIs, databases and UIs exclusively through ports (`src/application/ports`) and adapters (`src/infrastructure`). All calculations are deterministic, auditable and standardized internally in metric tons and USD.

| Module | Functional scope and deterministic logic |
| --- | --- |
| **1. Harvest Window & Phenology** | Estimates yields from 5-year departmental averages (datos.gob.ar) adjusted for seasonal rainfall. Combines editable Santa Fe varietal cycles (7-day intervals), INTA Manfredi dry-down curves and real weather forecasts (Open-Meteo, NASA POWER, IMERG, SMN) to define early, optimal and late harvest windows. |
| **2. Machinery Sizing & Freight Plan** | Dimensions combines, grain carts, baggers and trucks from acreage, yield and workable days (deducting rain days). Compares Modality A (dedicated daily charter for short hauls) against Modality B (trip/t-km CATAC reference tariff including loading/unloading/queue cycles) over real OSRM road routes. |
| **3. Net Margin Destination Comparator** | Computes net margin in USD/t and USD/ha across direct port delivery, local elevator/cooperative and silo-bag storage, recommending the highest-return destination. |
| **4. Local Marketplace ("Marketplace de Cadetes")** | Converts the simulation output into a structured operational order (equipment counts and dates), matches and assigns it to regional contractors, transporters and baggers with verified availability, and confirms bookings. |
| **5. Port Saturation & Shipping Indices** | Cross-references daily vessel demand (MAGyP, NABSA line-ups, BCR arrivals, Paraná River water levels via INA/SWOT) against proprietary pre-departure truck reservations from the marketplace. Automatically shifts dispatches away from saturated days or recommends elevators/silo bags. |
| **6. Commercial Sale Decision (Spot & Futures)** | Evaluates whether to sell immediately during harvest or store/hedge by analyzing CAC Rosario spot prices, A3 futures curves, port shipping indices and breakeven carry spreads. |
| **7. Silo-Bag IoT Monitoring & Risk** | Tracks registered silo bags and IoT sensor telemetry (CO₂, internal moisture, temperature) against INTA safe-storage matrices (moisture × temperature × hermeticity), issuing early spoilage alerts and "extract & sell" triggers. |
| **8. Conversational AI & What-If Assistant** | Translates deterministic outputs into plain producer language, explains trade-offs and runs interactive "what-if" scenarios (rain delays, price drops, freight hikes, port congestion) using OpenAI GPT-4o with retries and a deterministic template fallback. |

### Current prototype status, web platform and tech stack

- **Full-stack production deployment.** Both the Node.js HTTP REST API (`npm start`) and the React/JSX + Vite web application are live in production at https://agroflow-mctx.onrender.com and https://marcianos-hazel.vercel.app.
- **Interactive web frontend.** Light/dark themes; interactive map polygon drawing and editing over OpenFreeMap/OpenStreetMap and Esri satellite imagery (with automatic hectare calculation); GeoJSON boundary import; local browser persistence via IndexedDB; a "Plan & Dispatch" dashboard (simulation, AI explanation, "what-if" scenario runner and booking confirmation); a contractor/transporter marketplace view (`/api/ofertas`); and a floating AI chat assistant. Screenshots in the [README](../README.md#capturas).
- **Authentication and cloud persistence.** User authentication is powered by Neon Auth with role-based profiles (producers managing multiple fields/coordinates and service providers managing capacity/tariff offers) stored in PostgreSQL via private Vercel serverless functions.
- **Automated data and tariff pipelines.** CLI scripts for live weather snapshots, official USD exchange rate and CATAC PDF freight tariff ingestion, a unit test suite and end-to-end CLI simulations.
- **Next roadmap milestones.** Persist marketplace bookings in PostgreSQL alongside provider onboarding; validate the minimum marketplace penetration threshold with producers and carriers; integrate discharge slot APIs with Circular and Muvin; calibrate saturation thresholds against historical MAGyP/BCR truck arrival series.

### Quantified impact and scalability

AgroFlow directly targets Challenge Efficiency Pillars **A** (silo-bag optimization), **B** (idle-time and queue reduction) and **D** (fuel and freight efficiency), scaling across Santa Fe, Córdoba, Buenos Aires, Entre Ríos and La Pampa through a hybrid B2C and B2B2C model.

| Impact dimension | Baseline (traditional practice) | AgroFlow benefit and metric |
| --- | --- | --- |
| **Harvest & quality losses** | Late field entry or no rain-forecast adjustment; yield losses up to 264 kg/ha over ~33-day delays. | Up to 50% reduction in header shattering losses by harvesting within the optimal 15% moisture window. *Metric: kg/ha preserved and quality discount differential.* |
| **Port queue & congestion avoidance** | Blind dispatch during peak harvest (>850,000 trucks/month in Gran Rosario), causing multi-day terminal queues and forced spot sales. | Pre-departure demand-supply matching shifts trucks to fluid windows or local elevators/silo bags before departure. *Metric: terminal wait hours avoided and peak surcharge savings.* |
| **Freight & fuel efficiency** | Suboptimal truck hiring (idle trucks on short hauls or poor tariff structures on long hauls) and uncoordinated fleet booking. | Direct savings on logistics (~30% of grain value) by matching Modality A vs. B over real OSRM routes and pre-booking local fleets. *Metric: USD/t saved and deadhead truck-hours avoided.* |
| **Silo-bag IoT preservation** | Storage without systematic thermal/moisture/CO₂ tracking, risking fermentation and dry-matter shrinkage. | Preventive alerts combining IoT telemetry with INTA curves (moisture × temperature × time) before crossing spoilage thresholds. *Metric: % shrinkage avoided and breakeven spread compliance.* |
| **Comprehensive net margin** | Commercial and logistical decisions decoupled from vessel line-ups, Paraná draft, futures curves and elevator quotas. | Verifiable maximization of net margin in USD/ha and USD/t across harvest, destination and spot/futures sale timing. |

## 4. NASA Data

- **NASA POWER (Prediction Of Worldwide Energy Resources).** Historical and near-real-time surface temperature and relative humidity to model crop dry-down rates in the field and calibrate thermal spoilage risk inside on-farm silo bags.
- **NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM).** Used alongside Open-Meteo and SMN for precipitation monitoring and short-term rainfall forecasting, to adjust seasonal departmental yield estimates and deduct non-workable rain days when sizing combine harvesters and truck fleets.
- **NASA / CNES SWOT (Surface Water and Ocean Topography).** Used alongside local hydrological gauges (INA) to monitor water surface elevation and navigable draft along the Paraná River (Up-River Rosario port hub), evaluating vessel loading capacity and terminal congestion risk.

## 5. Competitive Landscape and Strategic Differentiation

A benchmark across 38 AgTech, maritime intelligence and logistics solutions in Argentina and major global grain hubs (Brazil, United States, Ukraine, Australia) confirms a market gap: mature point solutions exist for isolated signals (commercial sale timing, silo-bag telemetry, terminal slot booking, trader-oriented vessel line-ups), but no active platform integrates them into a single net-margin decision engine coupled with pre-departure fleet sizing and booking for the producer.

### Decision coverage matrix

**Decisions:** D1 = channel selection by net margin (port vs. elevator vs. silo bag) · D2 = port dispatch from vessel line-up, truck arrivals and river draft · D3 = sell now vs. store/hedge (spot and futures) · D4 = vessel and freight matching for stored grain · D5 = silo-bag IoT risk monitoring · D6 = machinery and truck fleet sizing and booking.

**Coverage:** ✅ full · 🟡 partial/indirect · — not covered.

| Solution / ecosystem | Origin / type | D1 | D2 | D3 | D4 | D5 | D6 |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| **AgroFlow (our solution)** | AR · Platform | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ sizes and books |
| cola-buques-rosario | AR · Open source | — | ✅ (no river draft) | — | — | — | — |
| Hedgit | AR · Startup | — | — | ✅ (A3 AI pricing) | — | — | — |
| Wiagro + IpesaSilo | AR · Hardware/SaaS | — | — | — | — | 🟡 sensors and alerts | — |
| SiloReal / Silcheck / Origino | AR · Fintech/IoT | — | — | — | — | 🟡 credit/A3 collateral | — |
| Circular / Muvin (BCR) | AR · Logistics | — | — | — | 🟡 | — | 🟡 slots, no sizing |
| fyo / Cooperatives (ACA GIRO) | AR · Advisory/Co-op | 🟡 | — | 🟡 | — | — | 🟡 human service |
| Uagri / Agro Digital Assist / Bot Agro | AR · Startups | 🟡 | — | 🟡 | — | — | 🟡 plant quotes/AI |
| Kpler / Signal Ocean / Argus / Vesper | Global · Maritime | — | 🟡 | — | 🟡 | — | — traders/exporters |
| Grão Direto (BR) / Bushel (US) | BR/US · AgTech | 🟡 | — | 🟡 | — | — | — delivery pricing/ERP |
| OPI / TeleSense / Amber (US/CA) | NA · Grain IoT | — | — | — | — | 🟡 | — bin telemetry |

### Top 5 closest competitors and market gaps

1. **cola-buques-rosario** (open-source prototype, D2). Ingests daily NABSA vessel PDFs, MAGyP truck entries and Williams unloading data to display a terminal coverage traffic light. It lacks Paraná River draft data, offers no pricing, net-margin or silo-bag logic, and gives producers no actionable dispatch recommendation.
2. **Hedgit** (Rosario commercialization AI, D3). A third-generation AI model trained on ~20 years of A3 futures and market quotes, distributed via 35 grain originators. Strong on sale timing, but it does not evaluate local basis, physical grain moisture/shrinkage, silo-bag carrying costs or port congestion.
3. **Wiagro + IpesaSilo SmartSilobag** (IoT hardware, D5). Factory-integrated nanosensors with satellite connectivity track CO₂, temperature and moisture inside silo bags. Telemetry stops at alerts: no automated "extract and sell" recommendation tied to live port line-ups and net margins.
4. **SiloReal and Silcheck** (silo-bag verification and fintech, D5 + credit). Turn remote silo-bag monitoring into financial collateral for working-capital loans (e.g. Galicia, Nera, A3-approved quality oracles), helping farmers defer sales, but lack commercial timing and freight optimization.
5. **Circular and Muvin** (port slot and dispatch coordination, D6/D4). Coordinate exporter quotas, truck assignments and terminal unloading appointments (Muvin operated 4.3 Mt in its initial rollout). Neither sizes harvest machinery/fleets ahead of harvest, models net margins or predicts pre-departure congestion.

### Defensible moats and ecosystem integration strategy

- **Closing cross-signal bridges.** AgroFlow links silo-bag IoT spoilage risk directly to commercial execution, translating biological and thermal storage alerts into concrete "extract and sell" orders with target pricing and optimal destinations. It also converts real-time port vessel-to-truck saturation metrics into producer-level dispatch and pricing decisions.
- **Proprietary pre-departure demand visibility.** Maritime analytics platforms (Kpler, Argus, Signal Ocean) track vessels and port arrivals retrospectively for downstream traders. AgroFlow's marketplace captures confirmed truck bookings before vehicles leave the farm gate, enabling proactive bottleneck and congestion avoidance.
- **Partner-first integration over replacement.** AgroFlow ingests open public feeds (MAGyP, NABSA, BCR, INA, datos.gob.ar), coexists with terminal appointment systems (Circular and Muvin) and deploys white-label decision support for cooperatives, grain elevators and commercial advisors (such as fyo or ACA).

## 6. Potential Partnerships

- **CREA Groups** (Regional Consortiums for Agricultural Experimentation): producers who voluntarily share information, analyze business management and experiment with new technologies.
- **Aapresid** (Argentine No-Till Farmers Association): a network of producers promoting sustainable production systems.
- **Agricultores Federados Argentinos SCL (AFA):** Argentine federated farmers cooperative.
- **FACMA** (Argentine Federation of Agricultural Machinery Contractors): federates agricultural machinery contractors across Argentina.
- **Starlink:** satellite telecommunications.
- **John Deere:** agricultural machinery manufacturer.

## 7. Data and Other References

- **CNES** (Centre National d'Études Spatiales): co-developer of the SWOT mission used for Paraná River water elevation monitoring.
- **INTA** (Instituto Nacional de Tecnología Agropecuaria, Manfredi Experimental Station): empirical grain loss curves by harvest delay, header shattering ratios at 15% moisture and silo-bag safe-storage time matrices (moisture × temperature × hermeticity).
- **INA** (Instituto Nacional del Agua) and **SMN** (Servicio Meteorológico Nacional): Paraná River hydrological telemetry/forecasts and national meteorological forecasts.
- **MAGyP, BCR (Bolsa de Comercio de Rosario) and NABSA:** announced vessels by port and product (MAGyP), daily vessel line-up reports (NABSA), grain reference prices, terminal congestion series and Up-River port truck arrival statistics (BCR).
- **CAC Rosario and A3 Markets:** daily spot reference board prices (Cámara Arbitral de Cereales de Rosario) and agricultural futures curves (A3) for sale timing.
- **CATAC and FACMA:** official agricultural road freight reference tariffs (USD/t-km parsed from CATAC PDF tables) and contractor machinery rates.
- **Datos Abiertos Agroindustria (datos.gob.ar):** 5-year historical crop yield series by department in Santa Fe province.
- **Open-source geospatial and routing tools:** OpenStreetMap (Nominatim and OSRM) for geocoding and real road-network distance/travel time; OpenFreeMap and Esri imagery for map rendering.

## 8. Use of Super Intelligence (SI)

- **Utilization.** AgroFlow integrates OpenAI (GPT-4o) strictly as an explanatory and conversational interface layer (Module 8), backed by automatic retries and a deterministic template fallback when offline.
- **Guardrails against numerical hallucination.** All yields, freight costs, port saturation indices, marketplace assignments and net margins are computed exclusively by the deterministic Node.js domain engine (`src/domain`). GPT-4o receives verified structured outputs to explain destination trade-offs in plain Spanish/English and to simulate user-driven "what-if" scenarios.
- **Transparency.** In accordance with NASA Space Apps Challenge SI guidelines, all source code, API responses, UI badges and submission materials explicitly disclose the use of GPT-4o for natural-language explanation and scenario framing.
