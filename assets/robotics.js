/* Robotics page: the robotics AI ecosystem across the US and China.
   - Animated supply map: seven layers (magnets → joints → sensors → chips → AI brains → robot makers → where robots work)
     in three lanes (US, allied suppliers, China). Dots flow along supply links; hover/tap a company to trace its chain,
     switch to cross-border or policy-risk views, or play the story layer by layer.
   - Interactive charts: humanoid shipments by maker (switch research firm), valuations, bill of materials with supplier
     drill-down, industrial robot installs, a US/China policy timeline and a filterable table of listed names.
   Everything is hand-edited from public reports (see SRC and ASOF); no external data is fetched. */
(function () {
  const ASOF = "Oct 14, 2026";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => n.toLocaleString("en-US");
  const LANEC = { us: "var(--us)", cn: "var(--cn)", al: "var(--al)" };
  const LANEN = { us: "United States", cn: "China", al: "Japan · Europe · Korea · Taiwan · SG" };
  const LANES = ["us", "al", "cn"];

  // ---------- shared tooltip ----------
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    let x = ev.pageX + 14, y = ev.pageY + 14;
    if (ev.clientX + 14 + r.width > vw - 8) x = Math.max(8 + window.scrollX, ev.pageX - r.width - 14);
    if (ev.clientY + 14 + r.height > window.innerHeight - 8) y = ev.pageY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  // touch: tap shows the tooltip, tapping elsewhere hides it
  document.addEventListener("click", (e) => { if (!e.target.closest("[data-tip]")) hideTip(); });

  // ================= the map =================
  const LAYERS = [
    { h: "Magnets", s: "Rare earths" },
    { h: "Joints", s: "Actuators, reducers, screws" },
    { h: "Senses", s: "LiDAR, cameras, touch" },
    { h: "Chips & compute", s: "Onboard and training" },
    { h: "AI brains", s: "Robot foundation models" },
    { h: "Robot makers", s: "Humanoids & industrial" },
    { h: "Where they work", s: "Customers today" },
  ];
  // [id, layer, lane, name, tagline, detail, ticker, dashboard page]
  const N = [
    // ---- United States
    ["mp", 0, "us", "MP Materials", "US rare earths & magnets", "Mines and refines rare earths at Mountain Pass and is building US magnet plants, the main domestic alternative to Chinese magnets. No robot maker has named it as a supplier yet.", "MP", "mp/"],
    ["thor", 3, "us", "NVIDIA Jetson Thor", "Onboard robot computer", "Blackwell-based robot computer (2,070 FP4 TFLOPS, 128 GB; modules from $2,999 in volume) that runs perception and AI models inside the robot. Early adopters include Agility, Boston Dynamics, Figure and Amazon; it is also the brain of the GR00T reference humanoid built on Unitree's H2 Plus.", "NVDA", "nvda/"],
    ["teslachip", 3, "us", "Tesla AI5 / AI6", "In-house inference chips", "Tesla's own chips for cars and Optimus, made by TSMC and Samsung. In October 2026 Musk cut their memory (AI5 144→72 GB) to lower cost at robot volumes.", "TSLA", "tesla/"],
    ["groot", 4, "us", "NVIDIA Isaac GR00T", "Open robot models & sim", "Open vision-language-action models (GR00T N1.7), Cosmos world models and Isaac Sim for training robots in simulation. Given away to sell Jetson chips; early users include Agility, Boston Dynamics and 1X.", "NVDA", "nvda/"],
    ["gemini", 4, "us", "Gemini Robotics", "Google DeepMind", "Gemini models adapted to see, reason and act, offered as a hosted API. Partnered with Boston Dynamics on Atlas (January 2026) and with Apptronik.", "GOOGL", "googl/"],
    ["pi", 4, "us", "Physical Intelligence", "π robot foundation models", "Builds π0-family models meant to drive any robot body (folding laundry, clearing tables). Raised about $1B at an $11B+ valuation in 2026, led by Founders Fund. Private; no named commercial customers yet.", "", ""],
    ["skild", 4, "us", "Skild AI", "Skild Brain", "Sells an 'omni-bodied' robot brain to other makers. Valued above $14B after a SoftBank-led $1.4B round in January 2026 with NVIDIA's venture arm. Private.", "", ""],
    ["helix", 4, "us", "Figure Helix", "In-house VLA model", "Figure's own vision-language-action model, running on every Figure 03. Nscale is building up to 100,000 NVIDIA GPUs of training compute for it.", "", ""],
    ["tsla", 5, "us", "Tesla Optimus", "Humanoid", "Production started at Fremont on the old Model S/X line: several hundred a week in August 2026, aiming for 1,000+ a week by year-end (reported). V3 not yet unveiled; outside sales targeted for late 2027. Leans on Chinese actuator suppliers, and China's magnet licences cost it 2–3 months in 2025.", "TSLA", "tesla/"],
    ["figure", 5, "us", "Figure AI", "Figure 03 humanoid", "Builds Figure 03 at its BotQ plant in San Jose, now about one robot an hour and past 1,000 units; working at BMW Spartanburg. Valued at $39B (Sep 2025); NVIDIA reportedly in talks to invest $1B more (Oct 2026). Private.", "", ""],
    ["agility", 5, "us", "Agility Robotics", "Digit, logistics humanoid", "Digit has moved 100,000+ totes at GXO and works at Toyota Canada and Schaeffler. Going public through a SPAC with Churchill Capital Corp XI at about $2.5B (announced June 2026).", "CCXI → AGLT", ""],
    ["apptronik", 5, "us", "Apptronik", "Apollo humanoid", "Austin-based; raised about $935M at $5–5.5B in early 2026 with Google joining. Works with Google DeepMind, Mercedes-Benz and GXO. Private.", "", ""],
    ["bd", 5, "us", "Boston Dynamics", "Electric Atlas", "Owned by Hyundai. The electric Atlas (shown at CES 2026, lifts 50 kg) has its whole 2026 run committed to Hyundai and Google DeepMind. Actuators from Hyundai Mobis.", "005380.KS", ""],
    ["amzn", 5, "us", "Amazon Robotics", "Warehouse robots", "Runs the world's largest fleet of mobile warehouse robots inside its own fulfillment centers, and an early Jetson Thor adopter.", "AMZN", "amzn/"],
    ["isrg", 5, "us", "Intuitive Surgical", "da Vinci surgical robots", "The largest robot business by revenue outside factories: da Vinci systems in operating rooms worldwide.", "ISRG", ""],
    ["ter", 5, "us", "Teradyne Robotics", "Universal Robots cobots", "Owns Universal Robots (collaborative arms) and MiR mobile robots; facing rising Chinese price competition in cobots.", "TER", "ter/"],
    ["rok", 5, "us", "Rockwell Automation", "Factory automation", "The controllers, drives and software that run automated lines; robots plug into its systems.", "ROK", "rok/"],
    ["c_usauto", 6, "us", "US car plants", "BMW, Hyundai, Tesla", "Figure at BMW Spartanburg, Atlas at Hyundai's Metaplant, Optimus inside Tesla's own factories.", "", ""],
    ["c_uslog", 6, "us", "Warehouses & logistics", "GXO, Amazon", "Digit and Apollo in GXO warehouses; Amazon's own robot fleet.", "", ""],
    ["c_hosp", 6, "us", "Hospitals", "Surgery", "Surgical robots in operating rooms.", "", ""],
    ["c_lab", 6, "us", "Research labs (US & EU)", "Stanford, ETH, Ai2", "Universities buy Unitree and NVIDIA platforms for research; NVIDIA's GR00T reference humanoid is aimed at them.", "", ""],
    // ---- allied suppliers
    ["hds", 1, "al", "Harmonic Drive Systems", "Strain-wave reducers · JP", "Japan's incumbent maker of the precision gears inside robot joints; reported to split Optimus reducer supply with China's Leaderdrive, whose prices run 40–60% of its own.", "6324.T", ""],
    ["nabtesco", 1, "al", "Nabtesco", "RV reducers · JP", "Heavy-duty RV gears used in the joints of most industrial robot arms.", "6268.T", ""],
    ["gsa", 1, "al", "GSA / Rollvis", "Roller screws · CH", "Swiss maker of planetary roller screws; reported first Optimus supplier at $1,350–2,700 a screw, now facing Chinese makers at about half the price. Private.", "", ""],
    ["mobis", 1, "al", "Hyundai Mobis", "Actuators · KR", "Signed to mass-produce the custom electric actuators in Atlas (31 per robot); says actuators are over 60% of a humanoid's bill of materials.", "012330.KS", ""],
    ["sharpa", 1, "al", "Sharpa", "Tactile hands · SG", "Singapore maker of the 22-degree-of-freedom Wave tactile hands on NVIDIA's GR00T reference humanoid. Private.", "", ""],
    ["tsm", 3, "al", "TSMC", "Chip foundry · TW", "Makes NVIDIA's Jetson Thor and Tesla's AI chips.", "TSM", "tsm/"],
    ["arm", 3, "al", "Arm", "CPU cores · UK", "The 14-core Arm CPU inside Jetson Thor; Arm cores run most robot controllers.", "ARM", "arm/"],
    ["nscale", 3, "al", "Nscale", "AI cloud · UK", "Committed $3.5B (rising to $6B+) of GPU compute to Figure, with up to 100,000 NVIDIA GPUs in Texas from late 2027, and became a Figure shareholder.", "", ""],
    ["fanuc", 5, "al", "FANUC", "Industrial arms · JP", "One of the big four industrial robot makers, holding share as Chinese brands squeeze margins.", "6954.T", ""],
    ["yaskawa", 5, "al", "Yaskawa", "Industrial arms · JP", "Motoman arms and servo motors; a big four industrial robot maker.", "6506.T", ""],
    ["abb", 5, "al", "ABB Robotics", "Industrial arms → SoftBank", "Being sold to SoftBank for $5.4B (EU cleared March 2026; closing expected 2H 2026), part of SoftBank's 'physical AI' push alongside its Skild AI stake.", "ABBN.SW", ""],
    ["c_glob", 6, "al", "Factories in Europe & Asia", "Mercedes, Airbus, Schaeffler", "Apollo at Mercedes-Benz, Walker S2 tested by Airbus, Digit at Schaeffler, and industrial arms in every major factory economy.", "", ""],
    // ---- China
    ["mag", 0, "cn", "Rare-earth magnets", "JL Mag & peers · ~90% share", "China processes about 90% of the world's NdFeB magnets, and each humanoid needs 3.5–4 kg of them in its joint motors. Export licences since April 2025 left Tesla with 'robots with no arms'; wider controls, suspended by the 2025 truce, are due back on Nov 10, 2026.", "300748.SZ", ""],
    ["tuopu", 1, "cn", "Tuopu Group", "Linear & rotary actuators", "Tesla chassis supplier turned actuator maker: reported Optimus actuator and hand-motor supplier, also ships joints to AgiBot and Unitree. Tesla audited its lines in September 2026.", "601689.SS", ""],
    ["sanhua", 1, "cn", "Sanhua Intelligent Controls", "Actuator assemblies", "Reported $685M Optimus linear-actuator order (October 2025); its joint modules also go to Unitree and UBTech. Audited by Tesla in September 2026.", "002050.SZ", ""],
    ["leader", 1, "cn", "Leaderdrive", "Harmonic reducers", "China's harmonic-reducer leader (425,158 sold in 2025, +72%). Customers include AgiBot and UBTech, with orders from Figure and Apptronik; reported second source for Optimus.", "688017.SS", ""],
    ["zhongda", 1, "cn", "Zhongda Leader", "Reducers & joint modules", "Value-priced plug-and-play joint modules ($700–1,050) and reducers; reported as a major Unitree supplier.", "002896.SZ", ""],
    ["screws", 1, "cn", "Hengli · Wuzhou Xinchun", "Planetary roller screws", "Chinese roller-screw makers scaling to millions of units a year at about half Swiss prices; named by Citi and Chinese press as qualifying for Optimus.", "601100.SS", ""],
    ["inovance", 1, "cn", "Inovance", "Servo motors & drives", "China's servo and drive leader, which also sells its own industrial robots.", "300124.SZ", ""],
    ["robosense", 2, "cn", "RoboSense", "LiDAR, touch, depth", "Robot LiDAR shipments up 510% to 282,600 in H1 2026; works with about 60 embodied-AI firms including Unitree, AgiBot and Fourier. On the Pentagon's 1260H list since June 2026.", "2498.HK", ""],
    ["orbbec", 2, "cn", "Orbbec", "3D depth cameras", "Depth cameras for robot vision; one of the main Chinese suppliers to humanoid and service robots.", "688322.SS", ""],
    ["joyson", 2, "cn", "Joyson Electronics", "Sensors & controllers", "Sensors and robot domain controllers for AgiBot and Galbot; audited by Tesla for Optimus in September 2026.", "600699.SS", ""],
    ["keli", 2, "cn", "Keli Sensing", "6-axis torque sensors", "China's main volume maker of six-axis force sensors for robot wrists and ankles; reported entrant to Tesla's supply chain.", "603662.SS", ""],
    ["horizon", 3, "cn", "Horizon Robotics", "Car & robot AI chips", "Chinese AI chip maker for cars with robot development kits: the main local alternative to NVIDIA's Jetson.", "9660.HK", ""],
    ["metax", 3, "cn", "MetaX", "GPUs · UBTech chip JV", "Chinese GPU maker that formed a chip joint venture with UBTech.", "", ""],
    ["go1", 4, "cn", "AgiBot GO-1", "In-house robot model", "AgiBot's own Genie Operator foundation model, trained on data from its teleoperation data factories.", "", ""],
    ["thinker", 4, "cn", "UBTech Thinker", "In-house AI stack", "UBTech's embodied-AI stack, combined with teleoperation and VLA models to train Walker S2 tasks.", "", ""],
    ["deepseek", 4, "cn", "DeepSeek", "Open AI models", "China's leading open model lab; a strategic investor in Unitree's IPO (about RMB 141M).", "", ""],
    ["unitree", 5, "cn", "Unitree", "Humanoids & robot dogs", "Listed on Shanghai's STAR Market in August 2026 (+460% on day one); RMB 1.70B revenue in 2025 at a 60% gross margin and profitable. About 5,900 humanoids in H1 2026 (SAG). New models can no longer get US approval after the FCC listing.", "688836.SS", ""],
    ["agibot", 5, "cn", "AgiBot", "Humanoid volume leader", "Largest humanoid shipper (about 8,400 in H1 2026, SAG; 9,700 per Counterpoint); its 20,000th robot rolled out in September 2026. Preparing a Hong Kong IPO at HK$40–50B and controls Shanghai-listed Swancor.", "688585.SS", ""],
    ["ubtech", 5, "cn", "UBTech", "Walker S2 factory humanoid", "Sold 921 full-size humanoids in H1 2026 on revenue of RMB 1.27B (+104%), still loss-making. Walker S2 works at BYD, Geely, FAW-VW and Foxconn; RMB 50M+ of overseas orders in September.", "9880.HK", ""],
    ["galbot", 5, "cn", "Galbot", "Wheeled humanoid", "Wheeled two-arm humanoids for retail and pharmacies; third-largest humanoid shipper in H1 2026 per Counterpoint. Private.", "", ""],
    ["xpeng", 5, "cn", "XPeng IRON", "Humanoid from an EV maker", "XPeng's IRON humanoid, backed by a reported $900M raise for mass production, uses the carmaker's own chips and plants.", "XPEV", ""],
    ["estun", 5, "cn", "Estun", "Industrial arms", "A leading Chinese industrial-robot brand; local makers supplied 55% of China's installs in 2025.", "002747.SZ", ""],
    ["kuka", 5, "cn", "KUKA (Midea)", "Industrial arms", "German robot maker owned by China's Midea since 2017 (fully since 2022).", "000333.SZ", ""],
    ["c_cnauto", 6, "cn", "Car & EV plants", "BYD, Geely, FAW-VW", "Walker S2, AgiBot and industrial arms on Chinese car lines; China's auto plants installed a record 78,900 robot arms in 2025.", "", ""],
    ["c_elec", 6, "cn", "Electronics plants", "Foxconn & others", "Electronics is China's biggest robot buyer (96,400 arms in 2025); Foxconn trials Walker S2.", "", ""],
    ["c_edu", 6, "cn", "Research, schools & shows", "60%+ of humanoids", "Entertainment, performances, data collection and research took over 60% of H1 2026 humanoid shipments (Counterpoint).", "", ""],
    ["c_retail", 6, "cn", "Retail & guidance", "Theme parks, stores", "AgiBot put 300+ robots in Chimelong's Hengqin park and 100 in ASD stores; service and guidance took about 19% of H1 shipments.", "", ""],
    ["c_export", 6, "cn", "Exports", "Europe, SE Asia, US", "Unitree launched in Europe in July 2026 and earned ~13% of 2025 revenue in the US; AgiBot exports to Southeast Asia and Europe.", "", ""],
  ];
  const RISK_TSLA = "Tesla audited Tuopu, Sanhua and Joyson in Sept 2026. A Section 232 tariff on robot parts (decision overdue) or China's magnet licences could hit this link.";
  const RISK_FCC = "Since Jul 28, 2026 the FCC Covered List blocks new Chinese humanoid and quadruped models from US authorization; existing models can still be sold.";
  const RISK_MAG = "China's rare-earth export licences stalled Optimus in 2025; the wider controls (incl. the 0.1% content rule) are due back on Nov 10, 2026.";
  // [from, to, kind (p parts · b chips & models · d deployment · c capital), label, risk]
  const E = [
    ["mag", "tuopu", "p", "Magnets for joint motors"], ["mag", "sanhua", "p", "Magnets"], ["mag", "inovance", "p", "Magnets for servo motors"],
    ["mag", "tsla", "p", "Magnets for arm actuators", RISK_MAG],
    ["tuopu", "tsla", "p", "Linear & rotary actuators (reported)", RISK_TSLA], ["tuopu", "agibot", "p", "Joint actuators"], ["tuopu", "unitree", "p", "Actuators & hand motors"],
    ["sanhua", "tsla", "p", "Linear actuators, $685M order (reported)", RISK_TSLA], ["sanhua", "unitree", "p", "Joint modules"], ["sanhua", "ubtech", "p", "Joint modules"],
    ["leader", "agibot", "p", "Harmonic reducers"], ["leader", "ubtech", "p", "Harmonic reducers"], ["leader", "figure", "p", "Harmonic reducers (orders)", "US humanoid makers buying Chinese reducers face 25% + 12.5% Section 301 tariffs and a pending Section 232 decision."],
    ["leader", "apptronik", "p", "Harmonic reducers (orders)", "US humanoid makers buying Chinese reducers face 25% + 12.5% Section 301 tariffs and a pending Section 232 decision."], ["leader", "tsla", "p", "Reducers, second source (reported)", RISK_TSLA],
    ["zhongda", "unitree", "p", "Reducers & joints (reported)"], ["screws", "tsla", "p", "Roller screws (qualifying)", RISK_TSLA],
    ["hds", "tsla", "p", "Strain-wave reducers (reported)"], ["nabtesco", "fanuc", "p", "RV reducers"], ["nabtesco", "yaskawa", "p", "RV reducers"], ["nabtesco", "abb", "p", "RV reducers"], ["nabtesco", "kuka", "p", "RV reducers"],
    ["gsa", "tsla", "p", "Roller screws (first source, reported)"], ["mobis", "bd", "p", "Atlas actuators"], ["sharpa", "unitree", "p", "Hands for the GR00T reference robot"],
    ["robosense", "unitree", "p", "LiDAR"], ["robosense", "agibot", "p", "LiDAR"], ["joyson", "agibot", "p", "Sensors & controllers"], ["joyson", "galbot", "p", "Sensors & controllers"],
    ["joyson", "tsla", "p", "Sensors & controllers (audited)", RISK_TSLA], ["keli", "tsla", "p", "Torque sensors (reported)", RISK_TSLA],
    ["tsm", "thor", "b", "Makes the chip"], ["tsm", "teslachip", "b", "Makes the chip"], ["arm", "thor", "b", "CPU cores"],
    ["thor", "unitree", "b", "Onboard computer (GR00T reference H2)", "NVIDIA chose Unitree for its reference humanoid; Unitree is on the Pentagon 1260H list and new Unitree models are blocked by the FCC. NVIDIA says robot data stays in the US."],
    ["thor", "bd", "b", "Jetson Thor (early adopter)"], ["thor", "agility", "b", "Jetson Thor (early adopter)"], ["thor", "figure", "b", "Jetson Thor (early adopter)"], ["thor", "amzn", "b", "Jetson Thor (early adopter)"],
    ["teslachip", "tsla", "b", "Optimus brain chip"], ["groot", "unitree", "b", "GR00T models (reference robot)"], ["groot", "agility", "b", "GR00T (early access)"], ["groot", "bd", "b", "GR00T (early access)"],
    ["gemini", "bd", "b", "Gemini Robotics on Atlas"], ["gemini", "apptronik", "b", "DeepMind partnership"], ["helix", "figure", "b", "Runs every Figure 03"], ["nscale", "helix", "b", "Training compute, $3.5B+"],
    ["go1", "agibot", "b", "Robot model"], ["thinker", "ubtech", "b", "AI stack"], ["metax", "ubtech", "b", "Chip joint venture"], ["deepseek", "unitree", "c", "Strategic IPO investor"],
    ["tsla", "c_usauto", "d", "Optimus in Tesla plants"], ["figure", "c_usauto", "d", "BMW Spartanburg"], ["bd", "c_usauto", "d", "Hyundai Metaplant"], ["rok", "c_usauto", "d", "Line automation"],
    ["agility", "c_uslog", "d", "GXO, 100k+ totes"], ["agility", "c_glob", "d", "Schaeffler, Toyota Canada"], ["apptronik", "c_uslog", "d", "GXO"], ["apptronik", "c_glob", "d", "Mercedes-Benz"],
    ["amzn", "c_uslog", "d", "Own fulfillment centers"], ["isrg", "c_hosp", "d", "da Vinci systems"], ["ter", "c_glob", "d", "Cobots"],
    ["unitree", "c_lab", "d", "Research platforms", RISK_FCC], ["unitree", "c_edu", "d", "Research, education, shows"], ["unitree", "c_export", "d", "Europe launch Jul 2026"],
    ["agibot", "c_retail", "d", "Chimelong park, ASD stores"], ["agibot", "c_cnauto", "d", "Fulin Precision line"], ["agibot", "c_export", "d", "SE Asia & Europe"],
    ["ubtech", "c_cnauto", "d", "BYD, Geely, FAW-VW"], ["ubtech", "c_elec", "d", "Foxconn"], ["ubtech", "c_glob", "d", "Airbus tests"], ["galbot", "c_retail", "d", "Retail & pharmacies"], ["xpeng", "c_cnauto", "d", "Own EV plants (pilot)"],
    ["estun", "c_cnauto", "d", "Robot arms"], ["kuka", "c_cnauto", "d", "Robot arms"], ["kuka", "c_glob", "d", "Robot arms"], ["fanuc", "c_glob", "d", "Robot arms"], ["fanuc", "c_cnauto", "d", "Robot arms"],
    ["yaskawa", "c_glob", "d", "Robot arms"], ["abb", "c_glob", "d", "Robot arms"], ["inovance", "c_cnauto", "d", "Servos & own robots"], ["inovance", "c_elec", "d", "Servos & own robots"],
  ];
  const STORY = [
    { l: [0], t: "Magnets first. Every robot joint spins a motor full of rare-earth magnets, 3.5–4 kg per humanoid, and China processes about 90% of them. MP Materials is the US's main alternative, but no robot maker has named it as a supplier yet." },
    { l: [1], t: "Joints are about half a humanoid's cost. China's Tuopu, Sanhua, Leaderdrive and the roller-screw makers build them at roughly half Japanese or Swiss prices, and even Tesla's Optimus leans on them. There is little US volume supply in this layer at all." },
    { l: [2], t: "The senses (LiDAR, depth cameras, torque and touch sensors) are another Chinese stronghold: RoboSense's robot LiDAR shipments rose fivefold in the first half of 2026." },
    { l: [3], t: "The US owns the robot's computer. NVIDIA's Jetson Thor, made at TSMC with Arm cores, sits inside US and Chinese robots alike; Tesla designs its own. China's alternatives (Horizon, MetaX) are early." },
    { l: [4], t: "And the US leads on brains: NVIDIA's open GR00T models, Google's Gemini Robotics, Physical Intelligence, Skild AI and Figure's Helix. Chinese makers mostly build in-house models such as AgiBot's GO-1 on top of open AI." },
    { l: [5], t: "Then the robots. Chinese makers shipped over 95% of 2026's humanoids so far (AgiBot, Unitree, UBTech, Galbot), while US makers lead on valuation and factory pilots (Figure, Tesla, Agility). Industrial arms are split between Japan, Europe and fast-growing Chinese brands." },
    { l: [6], t: "Where they work today: Chinese humanoids mostly go to research, schools, shows and guidance; both sides are piloting them in car plants. Switch to 'Policy risks' to see where tariffs, the FCC ban and magnet licences cut across these links.", v: "risk" },
  ];

  const host = $("rmap");
  const st = document.createElement("style");
  st.textContent = `
  #rmap .bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;margin:0 0 10px}
  #rmap .scroller{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
  #rmap svg{display:block;width:100%;min-width:1040px;height:auto}
  #rmap .lane{fill:color-mix(in srgb,var(--bg) 55%,var(--panel))}
  #rmap .lanel{font:600 10.5px var(--f-mono);letter-spacing:.12em;text-transform:uppercase}
  #rmap .colh{font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;fill:var(--ink)}
  #rmap .cols{font:400 10.5px var(--f-body);fill:var(--muted)}
  #rmap .gap{font:italic 400 11px var(--f-body);fill:var(--muted)}
  #rmap .ed{fill:none;stroke:var(--line);stroke-width:1.3;transition:opacity .2s,stroke .2s}
  #rmap .ed.c{stroke-dasharray:2 4}
  #rmap .ed.x{stroke:color-mix(in srgb,var(--muted) 55%,var(--line))}
  #rmap .nd{cursor:pointer;transition:opacity .2s}
  #rmap .nd rect.bx{fill:var(--panel);stroke:var(--line);stroke-width:1}
  #rmap .nd:hover rect.bx,#rmap .nd.pin rect.bx{stroke:var(--ink)}
  #rmap .nd text{font:600 11.5px var(--f-body);fill:var(--ink);pointer-events:none}
  #rmap .nd text.tg{font:400 9.5px var(--f-mono);fill:var(--muted)}
  #rmap .nd .rk{fill:var(--risk)}
  #rmap .p{pointer-events:none}
  #rmap .p.p_p{fill:var(--k-part)}#rmap .p.p_b{fill:var(--k-brain)}#rmap .p.p_d{fill:var(--k-dep)}
  #rmap svg.dim .nd:not(.on){opacity:.18}
  #rmap svg.dim .ed:not(.on){opacity:.08}
  #rmap svg.dim .p:not(.on){opacity:0}
  #rmap svg.dim .ed.on{stroke:var(--muted);stroke-width:1.9}
  #rmap svg.vx .ed:not(.x),#rmap svg.vx .p:not(.x){opacity:.06}
  #rmap svg.vr .ed:not(.r),#rmap svg.vr .p:not(.r){opacity:.06}
  #rmap svg.vr .ed.r{stroke:var(--risk);stroke-width:2;stroke-dasharray:5 4}
  #rmap .card{margin-top:12px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 20px}
  @media (max-width:760px){#rmap .card{grid-template-columns:minmax(0,1fr)}}
  #rmap .card h3{font:700 20px/1.2 var(--f-display);margin:2px 0 4px}
  #rmap .card .who{font:600 10.5px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  #rmap .card .tick{display:inline-block;font:600 11.5px var(--f-mono);background:var(--ink);color:var(--bg);padding:2px 7px;border-radius:3px;margin-right:6px}
  #rmap .card p{margin:6px 0;font-size:14px}
  #rmap .card ul{list-style:none;margin:0;padding:0;font-size:13.5px}
  #rmap .card li{padding:5px 0;border-top:1px solid color-mix(in srgb,var(--line) 60%,transparent);display:grid;grid-template-columns:10px minmax(0,1fr);gap:8px;align-items:baseline}
  #rmap .card li i{width:9px;height:9px;border-radius:2px;display:inline-block}
  #rmap .card li button{all:unset;cursor:pointer;font-weight:600;color:var(--accent)}
  #rmap .card li button:focus-visible{outline:2px solid var(--accent)}
  #rmap .card li small{display:block;color:var(--muted);font-size:12px}
  #rmap .card li .rkt{color:var(--risk)}
  #rmap .card h4{font:600 10.5px var(--f-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:4px 0 4px}
  #rmap .story{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:12px 14px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent-soft) 60%,transparent);border-radius:0 6px 6px 0}
  #rmap .story p{margin:0;font-size:14px;flex:1;min-width:0}
  #rmap .dots{display:flex;gap:5px;margin-top:8px}
  #rmap .dots i{width:8px;height:8px;border-radius:50%;background:var(--line)}
  #rmap .dots i.on{background:var(--accent)}
  #rmap .hint{font:500 11px var(--f-mono);color:var(--muted);margin:6px 0 0}
  @media (min-width:1060px){#rmap .hint.m{display:none}}
  `;
  document.head.appendChild(st);

  host.innerHTML = `
    <div class="bar">
      <div class="ctl" style="margin:0">
        <div class="cg"><span class="cgl">Show</span><div class="seg" data-g="v"><button data-v="all" aria-pressed="true">All links</button><button data-v="x" aria-pressed="false">Cross-border</button><button data-v="risk" aria-pressed="false">Policy risks</button></div></div>
        <div class="cg"><span class="cgl">Country</span><div class="seg" data-g="c"><button data-c="all" aria-pressed="true">All</button><button data-c="us" aria-pressed="false">US</button><button data-c="cn" aria-pressed="false">China</button></div></div>
      </div>
      <div class="cg"><button class="btn" data-a="play">▶ Play the story</button><button class="btn" data-a="prev" aria-label="Previous step">‹</button><button class="btn" data-a="next" aria-label="Next step">›</button><button class="btn" data-a="pause" aria-pressed="false">Pause motion</button></div>
    </div>
    <div class="scroller"><svg viewBox="0 0 1160 10" role="img" aria-label="Robotics supply map: US, allied and Chinese companies across seven layers, with supply links"></svg></div>
    <p class="hint m">Scroll sideways to see all seven layers.</p>
    <div class="leg"><span><i class="c-us"></i>US</span><span><i class="c-al"></i>Japan, Europe, Korea, Taiwan, Singapore</span><span><i class="c-cn"></i>China</span>
      <span><i class="ln" style="background:var(--k-part)"></i>Parts</span><span><i class="ln" style="background:var(--k-brain)"></i>Chips & AI models</span><span><i class="ln" style="background:var(--k-dep)"></i>Robots at work</span><span><i class="ln" style="background:var(--risk)"></i>Policy risk</span></div>
    <div class="story"><div style="flex:1;min-width:0"><p id="rStory">Press ▶ Play the story, or step through it, to walk the chain from magnets to the factory floor.</p><div class="dots">${STORY.map(() => "<i></i>").join("")}</div></div></div>
    <div class="panel card" id="rCard"></div>`;
  const svg = host.querySelector("svg");
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };

  // ---------- layout ----------
  const W = 1160, GUT = 30, COLW = (W - GUT - 10) / 7, BW = 146, BH = 34, VG = 7, TOP = 46, LPAD = 12;
  const byId = {}; N.forEach((n) => { byId[n[0]] = { id: n[0], L: n[1], lane: n[2], name: n[3], tag: n[4], d: n[5], tk: n[6], pg: n[7] }; });
  const cells = {}; N.forEach((n) => { const k = n[2] + n[1]; (cells[k] = cells[k] || []).push(n[0]); });
  const laneH = {}; LANES.forEach((ln) => { let m = 1; for (let l = 0; l < 7; l++) m = Math.max(m, (cells[ln + l] || []).length); laneH[ln] = m * (BH + VG) - VG + LPAD * 2; });
  let y = TOP; const laneY = {};
  LANES.forEach((ln) => { laneY[ln] = y; y += laneH[ln] + 10; });
  const H = y + 4;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const colX = (l) => GUT + COLW * l + (COLW - BW) / 2;
  LANES.forEach((ln) => {
    mk("rect", { class: "lane", x: GUT - 2, y: laneY[ln], width: W - GUT - 6, height: laneH[ln], rx: 6 }, svg);
    mk("rect", { x: 6, y: laneY[ln], width: 18, height: laneH[ln], rx: 4, style: `fill:${LANEC[ln]};opacity:.14` }, svg);
    const t = mk("text", { class: "lanel", x: 15, y: laneY[ln] + laneH[ln] / 2, "text-anchor": "middle", transform: `rotate(-90 15 ${laneY[ln] + laneH[ln] / 2})`, style: `fill:${LANEC[ln]}` }, svg);
    t.textContent = ln === "us" ? "United States" : ln === "cn" ? "China" : "Allies";
  });
  LAYERS.forEach((L, i) => {
    const cx = GUT + COLW * (i + 0.5);
    mk("text", { class: "colh", x: cx, y: 18, "text-anchor": "middle" }, svg).textContent = L.h;
    mk("text", { class: "cols", x: cx, y: 33, "text-anchor": "middle" }, svg).textContent = L.s;
  });
  // node positions
  LANES.forEach((ln) => {
    for (let l = 0; l < 7; l++) {
      const ids = cells[ln + l] || [], h = ids.length * (BH + VG) - VG, y0 = laneY[ln] + (laneH[ln] - h) / 2;
      ids.forEach((id, i) => { byId[id].x = colX(l); byId[id].y = y0 + i * (BH + VG); });
    }
  });
  // empty-cell notes
  [["us", 1, "Little US volume supply"], ["us", 2, "Few US volume suppliers"]].forEach(([ln, l, t]) => {
    if (!(cells[ln + l] || []).length) mk("text", { class: "gap", x: GUT + COLW * (l + 0.5), y: laneY[ln] + laneH[ln] / 2 + 4, "text-anchor": "middle" }, svg).textContent = t;
  });

  // ---------- edges ----------
  const gE = mk("g", {}, svg), gP = mk("g", {}, svg), gN = mk("g", {}, svg);
  const edges = E.map(([a, b, k, lab, risk]) => {
    const A = byId[a], B = byId[b];
    if (!A || !B) { console.warn("bad edge", a, b); return null; }
    let d;
    if (A.L === B.L) { const x = A.x, y1 = A.y + BH / 2, y2 = B.y + BH / 2, bend = 26 + Math.min(40, Math.abs(y2 - y1) / 6); d = `M${x},${y1} C${x - bend},${y1} ${x - bend},${y2} ${x},${y2}`; }
    else { const x1 = A.x + BW, y1 = A.y + BH / 2, x2 = B.x, y2 = B.y + BH / 2, dx = Math.max(40, (x2 - x1) * 0.5); d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; }
    const x = A.lane !== B.lane && k !== "c";
    const p = mk("path", { d, class: `ed ${k}${x ? " x" : ""}${risk ? " r" : ""}` }, gE);
    const e = { a, b, k, lab, risk, x, el: p, len: 0, dots: [] };
    if (k !== "c") {
      const n = 2;
      for (let i = 0; i < n; i++) e.dots.push({ el: mk("circle", { r: 2.6, class: `p p_${k}${x ? " x" : ""}${risk ? " r" : ""}` }, gP), t: i / n });
    }
    return e;
  }).filter(Boolean);
  const out = {}, inn = {};
  edges.forEach((e) => { (out[e.a] = out[e.a] || []).push(e); (inn[e.b] = inn[e.b] || []).push(e); });

  // ---------- nodes ----------
  const riskNodes = new Set(); edges.forEach((e) => { if (e.risk) { riskNodes.add(e.a); riskNodes.add(e.b); } });
  Object.values(byId).forEach((n) => {
    const g = mk("g", { class: "nd", tabindex: 0, role: "button", "aria-label": `${n.name}, ${n.tag}`, "data-id": n.id }, gN);
    mk("rect", { class: "bx", x: n.x, y: n.y, width: BW, height: BH, rx: 5 }, g);
    mk("rect", { x: n.x, y: n.y, width: 4, height: BH, rx: 2, style: `fill:${LANEC[n.lane]}` }, g);
    const t1 = mk("text", { x: n.x + 10, y: n.y + 14 }, g); fit(t1, n.name, BW - 22);
    const t2 = mk("text", { class: "tg", x: n.x + 10, y: n.y + 27 }, g); fit(t2, n.tag, BW - (n.pg ? 26 : 16));
    if (riskNodes.has(n.id)) mk("circle", { class: "rk", cx: n.x + BW - 7, cy: n.y + 7, r: 2.6 }, g);
    if (n.pg) { const s = mk("text", { class: "tg", x: n.x + BW - 6, y: n.y + 27, "text-anchor": "end" }, g); s.textContent = "↗"; }
    n.g = g;
    g.addEventListener("mouseenter", () => { if (!pinned) focus(n.id); });
    g.addEventListener("mouseleave", () => { if (!pinned) focus(multi); });
    g.addEventListener("click", (ev) => { ev.stopPropagation(); pin(pinned === n.id ? null : n.id); });
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pin(pinned === n.id ? null : n.id); } });
  });
  svg.addEventListener("click", () => { if (pinned) pin(null); });

  function fit(el, txt, max) {
    el.textContent = txt;
    if (el.getComputedTextLength() <= max) return;
    let t = txt; while (t.length > 3 && el.getComputedTextLength() > max) { t = t.slice(0, -1); el.textContent = t.trimEnd() + "…"; }
    const ti = document.createElementNS(NS, "title"); ti.textContent = txt; el.parentNode.appendChild(ti);
  }
  function placeAll() { edges.forEach((e) => { e.len = e.el.getTotalLength(); }); }
  let last = 0, paused = reduce, visible = true;
  function frame(ts) {
    const dt = Math.min(64, ts - (last || ts)); last = ts;
    if (!paused && visible) {
      for (const e of edges) for (const d of e.dots) {
        d.t = (d.t + dt / (2600 + e.len * 6)) % 1;
        const p = e.el.getPointAtLength(d.t * e.len); d.el.setAttribute("cx", p.x.toFixed(1)); d.el.setAttribute("cy", p.y.toFixed(1));
      }
    }
    requestAnimationFrame(frame);
  }
  placeAll();
  edges.forEach((e) => e.dots.forEach((d) => { const p = e.el.getPointAtLength(d.t * e.len); d.el.setAttribute("cx", p.x); d.el.setAttribute("cy", p.y); }));
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(svg);
  requestAnimationFrame(frame);

  // ---------- focus / views ----------
  let pinned = null, multi = null, view = "all", country = "all";
  function chain(id) {
    // whole upstream and downstream chain through this node
    const on = new Set([id]), eOn = new Set();
    const walk = (start, map, key) => { const q = [start]; while (q.length) { const c = q.shift(); for (const e of map[c] || []) { if (e.k === "c" && c !== id) continue; eOn.add(e); const nx = e[key]; if (!on.has(nx)) { on.add(nx); q.push(nx); } } } };
    walk(id, out, "b"); walk(id, inn, "a");
    return { on, eOn };
  }
  function apply(on, eOn) {
    svg.classList.toggle("dim", !!on);
    Object.values(byId).forEach((n) => n.g.classList.toggle("on", !!on && on.has(n.id)));
    edges.forEach((e) => { const v = !!eOn && eOn.has(e); e.el.classList.toggle("on", v); e.dots.forEach((d) => d.el.classList.toggle("on", v)); });
  }
  function focus(target) {
    Object.values(byId).forEach((n) => n.g.classList.toggle("pin", n.id === pinned));
    if (!target) { countryFocus(); return; }
    if (Array.isArray(target)) {
      const on = new Set(target), eOn = new Set(edges.filter((e) => on.has(e.a) || on.has(e.b)));
      eOn.forEach((e) => { on.add(e.a); on.add(e.b); });
      apply(on, eOn); return;
    }
    const { on, eOn } = chain(target); apply(on, eOn); card(target);
  }
  function countryFocus() {
    if (country === "all") { apply(null, null); return; }
    const on = new Set(Object.values(byId).filter((n) => n.lane === country).map((n) => n.id)), eOn = new Set();
    edges.forEach((e) => { if (on.has(e.a) || on.has(e.b)) eOn.add(e); });
    eOn.forEach((e) => { on.add(e.a); on.add(e.b); });
    apply(on, eOn);
  }
  function pin(id) { pinned = id; multi = null; focus(id); if (!id) card(null); }
  function setView(v) {
    view = v; svg.classList.toggle("vx", v === "x"); svg.classList.toggle("vr", v === "risk");
    host.querySelectorAll('[data-g="v"] button').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v));
    if (!pinned) card(null);
  }
  function setCountry(c) { country = c; host.querySelectorAll('[data-g="c"] button').forEach((b) => b.setAttribute("aria-pressed", b.dataset.c === c)); pinned = null; multi = null; focus(null); card(null); }
  host.querySelector('[data-g="v"]').onclick = (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.v); };
  host.querySelector('[data-g="c"]').onclick = (e) => { const b = e.target.closest("button"); if (b) setCountry(b.dataset.c); };

  const laneDot = (ln) => `<i style="background:${LANEC[ln]}"></i>`;
  function card(id) {
    const el = $("rCard");
    if (!id) {
      const xs = edges.filter((e) => e.x), us = xs.filter((e) => byId[e.b].lane === "us" && byId[e.a].lane === "cn").length, rk = edges.filter((e) => e.risk).length;
      el.innerHTML = `<div><span class="who">${view === "risk" ? "Policy risks" : view === "x" ? "Cross-border links" : "How to read the map"}</span>
        <h3>${view === "risk" ? `${rk} links exposed to tariffs, bans or export controls` : view === "x" ? `${xs.length} links cross a border; ${us} run from China into US robots` : "Tap any company"}</h3>
        <p>${view === "risk" ? "Dashed red links are where today's policy bites: China's magnet licences, US tariffs and audits on Chinese actuator suppliers, and the FCC block on new Chinese robot models. Red dots mark the companies involved." : view === "x" ? "US humanoid makers buy joints, reducers and sensors from China; Chinese makers buy NVIDIA's robot computer and models. Each side holds a chokepoint on the other." : "Each box is a company or customer group; its colour bar shows the country. Hover or tap to trace everything upstream and downstream of it, with a summary here. ↗ means there is a stock page on this dashboard."}</p></div>
        <div><h4>Chokepoints</h4><ul>
          <li>${laneDot("cn")}<span>China: rare-earth magnets (~90%), actuators & reducers at half import prices, 95%+ of humanoid output</span></li>
          <li>${laneDot("us")}<span>US: robot computers (Jetson Thor), robot foundation models, and the largest buyers' market behind the FCC gate</span></li>
          <li>${laneDot("al")}<span>Allies: precision reducers and roller screws (Japan, Switzerland), chip making (TSMC)</span></li></ul></div>`;
      return;
    }
    const n = byId[id], ups = inn[id] || [], dns = out[id] || [];
    const row = (e, other) => { const o = byId[other]; return `<li>${laneDot(o.lane)}<span><button data-go="${o.id}">${esc(o.name)}</button><small>${esc(e.lab)}</small>${e.risk ? `<small class="rkt">⚠ Policy risk</small>` : ""}</span></li>`; };
    const risks = [...new Set([...ups, ...dns].map((e) => e.risk).filter(Boolean))];
    el.innerHTML = `<div><span class="who">${esc(LANEN[n.lane])} · ${esc(LAYERS[n.L].h)}</span><h3>${esc(n.name)}</h3>
      <div>${n.tk ? `<span class="tick">${esc(n.tk)}</span>` : ""}<span style="font-size:13px;color:var(--muted)">${esc(n.tag)}</span></div>
      <p>${esc(n.d)}</p>${n.pg ? `<p><a href="../${n.pg}">Open the ${esc(n.tk || n.name)} stock page →</a></p>` : ""}${risks.length ? `<h4 style="margin-top:12px">Policy exposure</h4>${risks.map((r) => `<p style="font-size:13px;color:var(--risk)">⚠ ${esc(r)}</p>`).join("")}` : ""}</div>
      <div>${ups.length ? `<h4>Gets from</h4><ul>${ups.map((e) => row(e, e.a)).join("")}</ul>` : ""}${dns.length ? `<h4 style="margin-top:10px">Supplies / serves</h4><ul>${dns.map((e) => row(e, e.b)).join("")}</ul>` : ""}${!ups.length && !dns.length ? `<h4>Links</h4><p style="font-size:13px;color:var(--muted)">No named supply relationship on the map yet.</p>` : ""}</div>`;
    el.querySelectorAll("[data-go]").forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); pin(b.dataset.go); });
  }
  card(null);

  // ---------- story ----------
  let si = -1, timer = null;
  const dots = host.querySelectorAll(".dots i");
  function step(i) {
    si = (i + STORY.length) % STORY.length; const s = STORY[si];
    $("rStory").textContent = `${si + 1}/${STORY.length} · ${s.t}`;
    dots.forEach((d, k) => d.classList.toggle("on", k === si));
    pinned = null; multi = Object.values(byId).filter((n) => s.l.includes(n.L)).map((n) => n.id);
    setView(s.v || "all"); focus(multi);
  }
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; } host.querySelector('[data-a="play"]').textContent = "▶ Play the story"; }
  host.querySelector('[data-a="play"]').onclick = () => {
    if (timer) { stopPlay(); return; }
    host.querySelector('[data-a="play"]').textContent = "■ Stop";
    step(si + 1 >= STORY.length ? 0 : si + 1);
    timer = setInterval(() => { if (si + 1 >= STORY.length) { stopPlay(); return; } step(si + 1); }, 7000);
  };
  host.querySelector('[data-a="next"]').onclick = () => { stopPlay(); step(si + 1); };
  host.querySelector('[data-a="prev"]').onclick = () => { stopPlay(); step(si <= 0 ? STORY.length - 1 : si - 1); };
  host.querySelector('[data-a="pause"]').onclick = (e) => { paused = !paused; e.target.setAttribute("aria-pressed", paused); e.target.textContent = paused ? "Resume motion" : "Pause motion"; };
  if (reduce) { const b = host.querySelector('[data-a="pause"]'); b.setAttribute("aria-pressed", "true"); b.textContent = "Resume motion"; }

  // used by the BOM chart and the stock table
  window.__rmapFocus = (ids) => {
    stopPlay(); pinned = null;
    if (typeof ids === "string") { pin(ids); } else { multi = ids; focus(ids); $("rStory").textContent = "Highlighted: " + ids.map((i) => byId[i].name).join(", ") + ". Tap a company for its links."; }
    host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const n = byId[typeof ids === "string" ? ids : ids[0]], sc = host.querySelector(".scroller");
    if (n && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, n.x * (sc.scrollWidth / W) - sc.clientWidth / 3);
  };
  window.__rmapNodes = byId;

  // ================= KPI tiles =================
  const K = [
    ["Humanoids shipped, H1 2026", "19k–25k", "SAG 19.1k · Counterpoint 22k+ · IDC ~25k; up 270–430% on a year earlier"],
    ["Made in China", "95%+", "of H1 2026 humanoid shipments (IDC >95%, SAG 97%); Figure is the only US maker in IDC's top 10"],
    ["2026 forecast", "50k–90k", "Counterpoint 50k+, SAG ~60k, BofA 90k; IDC now sees 750k+ a year by 2030"],
    ["Industrial robots, 2025", "600k+", "installed worldwide; China 354k (59%), US ~38k (IFR)"],
    ["Highest valuation", "$39B", "Figure AI (private, Sep 2025); Unitree ~$28B in the market on Sep 10, 2026"],
    ["Next policy cliff", "Nov 10, 2026", "China's suspended rare-earth controls, incl. the 0.1% content rule, are due to return"],
  ];
  $("kpi").innerHTML = K.map(([b, v, s]) => `<div class="tile"><b>${b}</b><span class="v">${v}</span><small>${s}</small></div>`).join("");

  // ================= shipments chart =================
  const SHIP = {
    sag: { n: "SAG · H1 2026", tot: 19100, note: "Smart Analytics Global, Aug 10, 2026. Non-Chinese makers shipped fewer than 600 units combined.",
      r: [["AgiBot", "cn", 8400, "agibot"], ["Unitree", "cn", 5900, "unitree"], ["Galbot", "cn", 900, "galbot"], ["UBTech", "cn", 700, "ubtech"], ["Leju", "cn", 600], ["Other Chinese makers", "cn", 2000, null, "Remainder of the 18,500 Chinese units"], ["All non-Chinese makers", "us", 600, null, "Under 600 combined: Figure, Tesla, Agility, Apptronik and others"]] },
    cp: { n: "Counterpoint · H1 2026", tot: 22000, note: "Counterpoint Research, Aug 2026: 22,000+ units, up almost 300%. 'Everyone else' mixes Chinese and US makers.",
      r: [["AgiBot", "cn", 9700, "agibot"], ["Unitree", "cn", 7000, "unitree"], ["Galbot", "cn", 1100, "galbot"], ["UBTech", "cn", 1000, "ubtech"], ["Leju", "cn", 650], ["Everyone else", "mix", 3000]] },
    idc: { n: "IDC · H1 2026", tot: 25000, note: "IDC, Sep 30, 2026: almost 25,000 units, up 432%; Chinese vendors >95%. IDC charted vendors as bubbles, so figures are approximate; makers outside the top 10 hold ~28%.",
      r: [["AgiBot", "cn", 8600, "agibot"], ["Unitree", "cn", 5000, "unitree"], ["Booster Robotics", "cn", 1000], ["UBTech", "cn", 900, "ubtech"], ["Leju", "cn", 460], ["Galbot", "cn", 400, "galbot"], ["Astribot", "cn", 340], ["Fourier", "cn", 320], ["Galaxea AI", "cn", 260], ["Figure AI", "us", 40, "figure", "A few dozen units"]] },
    om: { n: "Omdia · 2025", tot: 13000, note: "Omdia, Jan 2026: about 13,000 humanoids in calendar 2025. Unitree says it delivered 5,500+ itself.",
      r: [["AgiBot", "cn", 5168, "agibot"], ["Unitree", "cn", 4200, "unitree"], ["UBTech", "cn", 1000, "ubtech"], ["Leju", "cn", 500], ["EngineAI", "cn", 400], ["Fourier", "cn", 300], ["Figure AI", "us", 150, "figure"], ["Agility", "us", 150, "agility"], ["Tesla", "us", 150, "tsla"], ["Others", "mix", 1350]] },
  };
  let shSrc = "sag";
  try { shSrc = localStorage.getItem("rb-ship") || shSrc; } catch (e) {}
  const shipEl = $("ship");
  shipEl.innerHTML = `<div class="ctl"><div class="cg"><span class="cgl">Counted by</span><div class="seg">${Object.entries(SHIP).map(([k, v]) => `<button data-s="${k}" aria-pressed="${k === shSrc}">${v.n}</button>`).join("")}</div></div></div>
    <div id="shBars"></div><div class="leg"><span><i class="c-cn"></i>Chinese maker</span><span><i class="c-us"></i>US maker</span><span><i style="background:var(--muted);opacity:.5"></i>Mixed</span></div><p class="note" id="shNote"></p>`;
  const bst = document.createElement("style");
  bst.textContent = `.hb{display:grid;grid-template-columns:150px minmax(0,1fr) 112px;gap:4px 12px;align-items:center;padding:6px 4px;border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent);border-radius:4px;cursor:default}
  .hb:first-child{border-top:0}.hb:hover{background:color-mix(in srgb,var(--accent-soft) 60%,transparent)}
  .hb .l{font:600 13px var(--f-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hb .t{position:relative;height:16px}
  .hb .t i{position:absolute;left:0;top:0;bottom:0;border-radius:0 4px 4px 0;transition:width .5s cubic-bezier(.2,.7,.2,1),left .5s}
  .hb .t i.rg{opacity:.35}
  .hb .v{font:600 13px var(--f-mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
  .hb .v span{color:var(--muted);font-weight:500;font-size:11.5px;margin-left:4px}
  .hb.lk{cursor:pointer}
  @media (max-width:620px){.hb{grid-template-columns:96px minmax(0,1fr) 86px}.hb .l{font-size:12px}.hb .v span{display:block;margin:0}}`;
  document.head.appendChild(bst);
  function ship() {
    const S = SHIP[shSrc], max = Math.max(...S.r.map((r) => r[2]));
    const box = $("shBars"); const prev = box.querySelectorAll(".hb i");
    box.innerHTML = S.r.map(([n, c, v, id, sub]) => `<div class="hb${id ? " lk" : ""}" data-tip="1" data-n="${esc(n)}" data-v="${v}" data-c="${c}" ${id ? `data-id="${id}"` : ""} ${sub ? `data-sub="${esc(sub)}"` : ""}>
      <span class="l">${esc(n)}</span><span class="t"><i style="width:0;background:${c === "mix" ? "var(--muted)" : LANEC[c]};${c === "mix" ? "opacity:.5" : ""}"></i></span>
      <span class="v">${v < 100 ? "~" + v : fmt(v)}<span>${(v / S.tot * 100).toFixed(v / S.tot < 0.01 ? 1 : 0)}%</span></span></div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll(".hb").forEach((r) => { r.querySelector("i").style.width = Math.max(0.6, +r.dataset.v / max * 100) + "%"; })));
    box.querySelectorAll(".hb").forEach((r) => {
      const h = (ev) => showTip(`<b>${esc(r.dataset.n)}</b><span class="mono">${fmt(+r.dataset.v)} units</span> · ${(r.dataset.v / S.tot * 100).toFixed(1)}% of ${fmt(S.tot)}<small>${r.dataset.c === "cn" ? "Chinese maker" : r.dataset.c === "us" ? "US maker" : "Mixed group"}${r.dataset.sub ? " · " + esc(r.dataset.sub) : ""}</small>${r.dataset.id ? "<small>Tap to find it on the map</small>" : ""}`, ev);
      r.addEventListener("mousemove", h); r.addEventListener("mouseleave", hideTip);
      if (r.dataset.id) r.addEventListener("click", () => window.__rmapFocus(r.dataset.id));
    });
    $("shNote").textContent = S.note;
  }
  shipEl.querySelector(".seg").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; shSrc = b.dataset.s; try { localStorage.setItem("rb-ship", shSrc); } catch (x) {} shipEl.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); ship(); };
  ship();

  // ================= valuations =================
  const VAL = [
    ["Figure AI", "us", 39, 39, "Private round", "Sep 2025", "Series C, $1B+ at $39B post-money. NVIDIA reportedly in talks to invest $1B more (Oct 2026).", "figure"],
    ["Unitree", "cn", 28, 28, "Public market value", "Sep 10, 2026", "RMB 201.6B at the Sep 10 close, down from about $62B at the debut-day open (Aug 19) and $50B+ at the first close. IPO priced at ~$9B.", "unitree"],
    ["Skild AI", "us", 14, 14, "Private round", "Jan 2026", "$1.4B round led by SoftBank with NVIDIA's venture arm; 'above $14B'.", "skild"],
    ["Physical Intelligence", "us", 11, 11, "Private round", "2026", "About $1B led by Founders Fund at 'north of $11B', double its $5.6B mark four months earlier.", "pi"],
    ["AgiBot", "cn", 5.1, 6.4, "IPO target", "Hong Kong, pending", "HK$40–50B target with CICC, CITIC and Morgan Stanley; last private mark above RMB 20B. Its Swancor stake alone was worth ~$6.2B in August.", "agibot"],
    ["Apptronik", "us", 5, 5.5, "Private round", "Feb 2026", "About $935M with Google joining as a backer.", "apptronik"],
    ["ABB Robotics", "al", 5.4, 5.4, "Deal value (EV)", "Pending, 2H 2026", "SoftBank's $5.375B purchase of ABB's robot arm business; EU cleared it in March 2026.", "abb"],
    ["Agility Robotics", "us", 2.5, 2.5, "SPAC deal", "Jun 2026", "Merging with Churchill Capital Corp XI at about $2.5B.", "agility"],
  ];
  let vSort = "v";
  const valEl = $("val");
  valEl.innerHTML = `<div class="ctl"><div class="cg"><span class="cgl">Sort</span><div class="seg"><button data-o="v" aria-pressed="true">By value</button><button data-o="c" aria-pressed="false">By country</button></div></div></div>
    <div id="vBars"></div><div class="leg"><span><i class="c-us"></i>US</span><span><i class="c-cn"></i>China</span><span><i class="c-al"></i>Allied</span><span><i style="background:var(--muted);opacity:.35"></i>Range of a target</span></div>
    <p class="note">Private marks are the last priced round, not today's value; Unitree moves daily on Shanghai's STAR Market. Click a bar to find the company on the map.</p>`;
  function vals() {
    const rows = VAL.slice().sort(vSort === "v" ? (a, b) => b[3] - a[3] : (a, b) => LANES.indexOf(a[1]) - LANES.indexOf(b[1]) || b[3] - a[3]);
    const max = 40, box = $("vBars");
    box.innerHTML = rows.map(([n, c, lo, hi, kind, when, d, id]) => `<div class="hb lk" data-tip="1" data-id="${id}" data-lo="${lo}" data-hi="${hi}">
      <span class="l">${esc(n)}</span><span class="t"><i style="width:0;background:${LANEC[c]}"></i>${hi > lo ? `<i class="rg" style="left:${lo / max * 100}%;width:0;background:${LANEC[c]}"></i>` : ""}</span>
      <span class="v">$${hi > lo ? `${lo}–${hi}` : lo}B<span style="display:block;margin:0">${esc(kind)}</span></span></div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll(".hb").forEach((r) => {
      const is = r.querySelectorAll("i"); is[0].style.width = (+r.dataset.lo / max * 100) + "%"; if (is[1]) is[1].style.width = ((r.dataset.hi - r.dataset.lo) / max * 100) + "%";
    })));
    box.querySelectorAll(".hb").forEach((r, i) => {
      const v = rows[i];
      r.addEventListener("mousemove", (ev) => showTip(`<b>${esc(v[0])}</b><span class="mono">$${v[3] > v[2] ? `${v[2]}–${v[3]}` : v[2]}B</span> · ${esc(v[4])}, ${esc(v[5])}<small>${esc(v[6])}</small><small>Tap to find it on the map</small>`, ev));
      r.addEventListener("mouseleave", hideTip);
      r.addEventListener("click", () => window.__rmapFocus(v[7]));
    });
  }
  valEl.querySelector(".seg").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; vSort = b.dataset.o; valEl.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); vals(); };
  vals();

  // ================= bill of materials =================
  const BOM = [
    ["Rotary actuators", 20, 28, "14–16 per robot: frameless motor + harmonic reducer + encoder + driver in each shoulder, elbow, waist, hip and ankle.",
      [["cn", "Leaderdrive, Zhongda Leader, Sanhua, Inovance"], ["al", "Harmonic Drive Systems, Nabtesco"]], "Chinese joint module $700–1,250 vs $1,500–3,000 imported; Chinese reducers sell at 40–60% of Japanese prices.", ["leader", "zhongda", "sanhua", "inovance", "hds", "nabtesco"]],
    ["Linear actuators", 15, 22, "10–14 per robot: a motor driving a planetary roller screw, in knees, hips and some elbows. The hardest part to machine at volume.",
      [["cn", "Tuopu, Sanhua, Hengli, Wuzhou Xinchun"], ["al", "GSA/Rollvis, Ewellix"]], "Chinese linear actuators RMB 3,500–7,000 vs 7,000–15,000 imported; Rollvis roller screws ran $1,350–2,700 each for early Optimus.", ["tuopu", "sanhua", "screws", "gsa"]],
    ["Dexterous hands", 10, 18, "Two hands with 12–22 degrees of freedom each; Musk calls them the majority of Optimus's engineering difficulty.",
      [["cn", "Zhaowei, DINGS micro-motors, Tuopu hand motors"], ["al", "Sharpa (Singapore)"], ["us", "Tesla (in-house, tendon-driven)"]], "Western research hands cost several thousand dollars; Chinese makers target an order of magnitude less at volume.", ["sharpa", "tuopu", "tsla"]],
    ["Sensors", 8, 14, "30–80+ channels: LiDAR and depth cameras, six-axis force/torque sensors, tactile skin, IMUs.",
      [["cn", "RoboSense, Orbbec, Joyson, Keli Sensing"]], "Robot LiDAR is now a volume business: RoboSense shipped 282,600 robot units in H1 2026.", ["robosense", "orbbec", "joyson", "keli"]],
    ["Structure, bearings & skin", 8, 12, "Frame, about 72 bearings, covers and flexible skin.", [["cn", "China's auto-parts forging, casting and skin base"]], "Chinese makers reuse EV supply chains for these parts.", null],
    ["Controller & compute", 5, 9, "One or two onboard computers for perception, models and control.",
      [["us", "NVIDIA Jetson Thor, Tesla AI5"], ["al", "TSMC (makes them)"], ["cn", "Horizon Robotics"]], "Jetson Thor T5000 modules from $2,999 at 1,000-unit volume.", ["thor", "teslachip", "horizon", "tsm"]],
    ["Cabling, assembly & test", 5, 8, "Harnesses, fasteners, final assembly and test.", [["cn", "Yangtze and Pearl River Delta contract makers"]], "", null],
    ["Battery & power", 3, 6, "One pack, typically about 1 kWh for 2–5 hours.", [["cn", "EV battery chain (CATL-class cells)"]], "", null],
  ];
  const bomEl = $("bom");
  const SEQ = ["--b0", "--b1", "--b2", "--b3", "--b4", "--b5", "--b6", "--b7"];
  const bcss = document.createElement("style");
  bcss.textContent = `:root{--b0:#1e3a5f;--b1:#2c5282;--b2:#3b6aa8;--b3:#5a87c0;--b4:#7fa3d1;--b5:#a3bfe0;--b6:#c3d5ec;--b7:#dce7f5}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--b0:#dce7f5;--b1:#b5cbe8;--b2:#8eaedb;--b3:#6c93cc;--b4:#5079b4;--b5:#3d6197;--b6:#2f4c78;--b7:#243a5c}}
  :root[data-theme="dark"]{--b0:#dce7f5;--b1:#b5cbe8;--b2:#8eaedb;--b3:#6c93cc;--b4:#5079b4;--b5:#3d6197;--b6:#2f4c78;--b7:#243a5c}
  .bomb{display:flex;height:46px;gap:2px;border-radius:6px;overflow:hidden;margin:4px 0 10px}
  .bomb button{all:unset;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;min-width:6px;transition:filter .15s,transform .15s;outline-offset:-3px}
  .bomb button:focus-visible{outline:3px solid var(--accent)}
  .bomb button span{font:600 11px var(--f-mono);color:#fff;white-space:nowrap;overflow:hidden;padding:0 4px;text-shadow:0 1px 2px rgba(0,0,0,.35)}
  .bomb.sel button:not(.on){filter:saturate(.3) opacity(.45)}
  .bomg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 24px}
  @media (max-width:760px){.bomg{grid-template-columns:minmax(0,1fr)}}
  .bomg ul{list-style:none;margin:0;padding:0}
  .bomg li{display:grid;grid-template-columns:12px minmax(0,1fr) 64px;gap:8px;align-items:center;padding:5px 4px;border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent);font-size:13.5px;cursor:pointer;border-radius:4px}
  .bomg li:first-child{border-top:0}.bomg li:hover,.bomg li.on{background:var(--accent-soft)}
  .bomg li i{width:12px;height:12px;border-radius:3px}
  .bomg li b{font:600 12.5px var(--f-mono);text-align:right}
  .bomd h3{font:700 19px/1.2 var(--f-display);margin:0 0 4px}
  .bomd p{margin:6px 0;font-size:14px}
  .bomd .sp{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
  .bomd .sp span{font-size:12.5px;border:1px solid var(--line);border-radius:4px;padding:3px 8px;display:inline-flex;gap:6px;align-items:center}
  .bomd .sp i{width:9px;height:9px;border-radius:2px}
  .bomd .gapq{border-left:3px solid var(--accent);padding:6px 10px;background:color-mix(in srgb,var(--accent-soft) 60%,transparent);font-size:13.5px}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:14px}
  .facts div{border:1px solid var(--line);border-radius:5px;padding:9px 11px}
  .facts b{display:block;font:600 10px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .facts span{font:600 18px var(--f-mono)}
  .facts small{display:block;font-size:12px;color:var(--muted)}`;
  document.head.appendChild(bcss);
  const mid = BOM.map((b) => (b[1] + b[2]) / 2), tot = mid.reduce((a, b) => a + b, 0);
  let bSel = 0;
  bomEl.innerHTML = `<div class="bomb" role="group" aria-label="Bill of materials">${BOM.map((b, i) => `<button data-i="${i}" data-tip="1" style="flex:${mid[i]};background:var(${SEQ[i]})" aria-label="${esc(b[0])}, ${b[1]}–${b[2]}% of cost"><span>${mid[i] / tot > 0.09 ? esc(b[0].split(" ")[0]) : ""}</span></button>`).join("")}</div>
    <div class="bomg"><ul>${BOM.map((b, i) => `<li data-i="${i}"><i style="background:var(${SEQ[i]})"></i><span>${esc(b[0])}</span><b>${b[1]}–${b[2]}%</b></li>`).join("")}</ul><div class="bomd" id="bomD"></div></div>
    <div class="facts"><div><b>Unitree G1</b><span>~$16k</span><small>Entry R1 under $6k; Chinese full-size models widely $16k–40k</small></div><div><b>Optimus cost target</b><span>$20–30k</span><small>Long-run target, not a price; first units to be leased</small></div><div><b>Optimus without China</b><span>~$131k</span><small>Teardown-based estimate for a fully non-Chinese bill of materials, vs ~$46k today</small></div></div>
    <p class="note">Shares are ranges from industry teardowns (midpoints drawn); Morgan Stanley puts actuators near 56% of cost and Hyundai Mobis says over 60%.</p>`;
  function bom(i) {
    bSel = i; const b = BOM[i];
    bomEl.querySelector(".bomb").classList.add("sel");
    bomEl.querySelectorAll(".bomb button").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
    bomEl.querySelectorAll(".bomg li").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
    $("bomD").innerHTML = `<h3>${esc(b[0])} · ${b[1]}–${b[2]}%</h3><p>${esc(b[3])}</p>
      <div class="sp">${b[4].map(([c, t]) => `<span><i style="background:${LANEC[c]}"></i>${esc(t)}</span>`).join("")}</div>
      ${b[5] ? `<div class="gapq">${esc(b[5])}</div>` : ""}${b[6] ? `<p><button class="btn" data-map>Show these suppliers on the map</button></p>` : ""}`;
    const m = $("bomD").querySelector("[data-map]"); if (m) m.onclick = () => window.__rmapFocus(b[6]);
  }
  bomEl.querySelectorAll(".bomb button, .bomg li").forEach((x) => x.addEventListener("click", () => bom(+x.dataset.i)));
  bomEl.querySelectorAll(".bomb button").forEach((x) => {
    const b = BOM[+x.dataset.i];
    x.addEventListener("mousemove", (ev) => showTip(`<b>${esc(b[0])}</b><span class="mono">${b[1]}–${b[2]}% of cost</span><small>Tap for suppliers</small>`, ev));
    x.addEventListener("mouseleave", hideTip);
  });
  bom(0);

  // ================= industrial robots =================
  const IND = [["China", "cn", 354000, "354,000 (+20%); 59% of the world. Chinese brands 195,000 (55%), foreign brands ~159,000.", 195000],
    ["United States", "us", 38400, "~38,400 (+12%); passed Japan for second place."], ["Japan", "al", 36219, "36,219 (−19%)."], ["South Korea", "al", 30000, "~30,000 (−1%)."],
    ["Germany", "al", 25000, "Under 25,000 (−8%)."], ["India", "mix", 10500, "~10,500 (+15%)."]];
  let iSplit = false;
  const indEl = $("ind");
  indEl.innerHTML = `<div class="ctl"><div class="cg"><span class="cgl">China split</span><div class="seg"><button data-s="0" aria-pressed="true">Total</button><button data-s="1" aria-pressed="false">Chinese vs foreign brands</button></div></div></div>
    <div id="iBars"></div><div class="leg"><span><i class="c-cn"></i>China</span><span><i class="c-us"></i>US</span><span><i class="c-al"></i>Allies</span><span><i style="background:var(--muted);opacity:.5"></i>Other</span><span id="iLeg2" hidden><i style="background:var(--cn);opacity:.4"></i>Foreign brands installed in China</span></div>
    <p class="note">Worldwide installs topped 600,000 in 2025 (+11%) and the operating stock hit 5 million. IFR expects 655,000 in 2026 and 806,000 by 2029. Source: IFR World Robotics 2026, Sep 24, 2026.</p>`;
  function ind() {
    const max = 354000, box = $("iBars");
    box.innerHTML = IND.map(([n, c, v, d, dom]) => `<div class="hb" data-tip="1"><span class="l">${n}</span><span class="t"><i style="width:0;background:${c === "mix" ? "var(--muted)" : LANEC[c]};${c === "mix" ? "opacity:.5" : ""}"></i>${dom ? `<i class="rg" style="width:0;left:0;background:var(--cn)"></i>` : ""}</span><span class="v">${v === 25000 ? "<25,000" : (n === "United States" || n === "South Korea" || n === "India" ? "~" : "") + fmt(v)}</span></div>`).join("");
    $("iLeg2").hidden = !iSplit;
    requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll(".hb").forEach((r, i) => {
      const [, , v, , dom] = IND[i], is = r.querySelectorAll("i");
      if (dom && iSplit) { is[0].style.width = dom / max * 100 + "%"; is[1].style.left = dom / max * 100 + "%"; is[1].style.width = (v - dom) / max * 100 + "%"; }
      else { is[0].style.width = v / max * 100 + "%"; if (is[1]) { is[1].style.left = v / max * 100 + "%"; is[1].style.width = "0"; } }
    })));
    box.querySelectorAll(".hb").forEach((r, i) => { r.addEventListener("mousemove", (ev) => showTip(`<b>${IND[i][0]}, 2025</b><small>${esc(IND[i][3])}</small>`, ev)); r.addEventListener("mouseleave", hideTip); });
  }
  indEl.querySelector(".seg").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; iSplit = b.dataset.s === "1"; indEl.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); ind(); };
  ind();

  // ================= policy timeline =================
  const POL = [
    ["2025-04-04", "cn", "Magnet export licences", "China requires licences for seven rare earths and magnets; Optimus production stalls ('robots with no arms'), costing Tesla 2–3 months."],
    ["2025-09-24", "us", "Section 232 robotics probe", "Commerce opens a national-security investigation into robots and industrial machinery, explicitly including parts. The decision is overdue."],
    ["2025-10-09", "cn", "Wider rare-earth controls", "China adds an extraterritorial rule covering products with even 0.1% Chinese rare-earth content."],
    ["2025-11-10", "both", "One-year truce", "The US–China deal suspends China's expanded controls for a year."],
    ["2026-02-20", "us", "IEEPA tariffs struck down", "The Supreme Court strikes down the triple-digit emergency tariffs; Section 301 tariffs on robots and parts (25%) stay."],
    ["2026-06-08", "us", "Unitree on Pentagon 1260H list", "Unitree and RoboSense are named 'Chinese military companies'. Direct DoD contracts are barred from June 30, 2026, and products containing their parts from June 30, 2027."],
    ["2026-07-22", "us", "House passes NDAA Sec. 163", "Bars the Pentagon from buying, leasing or operating humanoids from adversary nations; goes to conference with the Senate."],
    ["2026-07-24", "us", "Extra 12.5% Section 301 tariff", "Stacks on the 25% Section 301 tariff for roughly 35–40% on Chinese robots and servo parts."],
    ["2026-07-28", "us", "FCC blocks new Chinese robots", "Foreign-made humanoids, quadrupeds and mobile robots go on the FCC Covered List; new models can't be authorized, existing ones can still be sold. Beijing warns of countermeasures."],
    ["2026-08-19", "cn", "Unitree lists in Shanghai", "Up 460% on day one; Beijing's capital markets back domestic champions despite the US moves."],
    ["2026-11-10", "cn", "Truce expiry: magnet rules return", "China's suspended rare-earth controls, including the 0.1% rule, are scheduled to return unless extended — just as Optimus ramps."],
    ["2027-06-30", "us", "1260H component bar", "The Pentagon may no longer buy goods containing parts from listed firms such as Unitree."],
  ];
  const polEl = $("pol");
  const pcss = document.createElement("style");
  pcss.textContent = `#pol svg{display:block;width:100%;height:auto}
  #pol .ax{stroke:var(--line);stroke-width:2}
  #pol .yr{font:600 11px var(--f-mono);fill:var(--muted)}
  #pol .ev{cursor:pointer}
  #pol .ev circle{stroke:var(--panel);stroke-width:2}
  #pol .ev text{font:600 10.5px var(--f-body);fill:var(--ink)}
  #pol .ev line{stroke:var(--line)}
  #pol .ev.fut circle{fill:var(--panel)!important;stroke-width:2.5}
  #pol .ev.on text{fill:var(--accent)}
  #pol .today line{stroke:var(--accent);stroke-width:1.5;stroke-dasharray:3 3}
  #pol .today text{font:600 10px var(--f-mono);fill:var(--accent)}
  #pol .pulse{fill:var(--accent);animation:pl 1.8s ease-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes pl{0%{opacity:.6;transform:scale(1)}100%{opacity:0;transform:scale(3)}}
  #pol .lanel{font:600 10px var(--f-mono);letter-spacing:.1em;text-transform:uppercase}
  #pol ol{list-style:none;margin:14px 0 0;padding:0}
  #pol li{display:grid;grid-template-columns:96px 70px minmax(0,1fr);gap:4px 12px;padding:8px 6px;border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent);font-size:13.5px;border-radius:4px}
  #pol li.on{background:var(--accent-soft)}
  #pol li .d{font:500 12px var(--f-mono);color:var(--muted)}
  #pol li .s{font:600 10px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:3px;color:#fff;align-self:start;text-align:center}
  #pol li b{display:block}
  #pol li small{display:block;color:var(--muted);font-size:12.5px}
  #pol li.fut .d::after{content:" · next";color:var(--accent)}
  @media (max-width:640px){#pol svg{display:none}#pol li{grid-template-columns:78px minmax(0,1fr)}#pol li .s{grid-column:1;grid-row:2;justify-self:start}#pol li>div{grid-column:2;grid-row:1/3}}`;
  document.head.appendChild(pcss);
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.parse("2025-03-01"), t1 = Date.parse("2027-08-01"), PW = 1100, PH = 260, X = (d) => 40 + (Date.parse(d) - t0) / (t1 - t0) * (PW - 80), AY = 150;
  let ps = `<svg viewBox="0 0 ${PW} ${PH}" role="img" aria-label="Timeline of US and Chinese robotics policy actions">
    <text class="lanel" x="8" y="18" style="fill:var(--us)">US actions ↑</text><text class="lanel" x="8" y="${AY + 60}" style="fill:var(--cn)">China actions ↓</text>
    <line class="ax" x1="30" x2="${PW - 30}" y1="${AY}" y2="${AY}"/>`;
  ["2025-07-01", "2026-01-01", "2026-07-01", "2027-01-01", "2027-07-01"].forEach((d) => { ps += `<line x1="${X(d)}" x2="${X(d)}" y1="${AY - 4}" y2="${AY + 4}" style="stroke:var(--muted)"/><text class="yr" x="${X(d)}" y="${AY + 18}" text-anchor="middle">${d.slice(5, 7) === "01" ? d.slice(0, 4) : "Jul " + d.slice(2, 4)}</text>`; });
  const slots = { us: [], cn: [], both: [] };
  POL.forEach((p, i) => {
    const x = X(p[0]), side = p[1], col = side === "us" ? "var(--us)" : side === "cn" ? "var(--cn)" : "var(--muted)";
    let lvl = 0; const arr = slots[side === "both" ? "us" : side]; while (arr.some((s) => s.l === lvl && Math.abs(s.x - x) < 175)) lvl++; arr.push({ x, l: lvl });
    const dy = side === "cn" ? 40 + lvl * 26 : -(36 + lvl * 26);
    const fut = p[0] > today;
    ps += `<g class="ev${fut ? " fut" : ""}" data-i="${i}" data-tip="1" tabindex="0"><line x1="${x}" x2="${x}" y1="${AY}" y2="${AY + dy + (dy < 0 ? 4 : -10)}"/><circle cx="${x}" cy="${AY}" r="6" style="fill:${col};stroke:${fut ? col : ""}"/><text x="${x}" y="${AY + dy}" text-anchor="${x > PW - 180 ? "end" : x < 160 ? "start" : "middle"}">${esc(p[2])}</text></g>`;
  });
  if (today >= "2025-03-01" && today <= "2027-08-01") ps += `<g class="today"><line x1="${X(today)}" x2="${X(today)}" y1="24" y2="${PH - 24}"/><circle class="pulse" cx="${X(today)}" cy="${AY}" r="4"/><circle cx="${X(today)}" cy="${AY}" r="4" style="fill:var(--accent)"/><text x="${X(today) + 5}" y="34">Today</text></g>`;
  ps += `</svg>`;
  polEl.innerHTML = ps + `<ol>${POL.map((p, i) => `<li data-i="${i}" class="${p[0] > today ? "fut" : ""}"><span class="d">${new Date(p[0] + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span><span class="s" style="background:${p[1] === "us" ? "var(--us)" : p[1] === "cn" ? "var(--cn)" : "var(--muted)"}">${p[1] === "both" ? "Both" : p[1] === "us" ? "US" : "China"}</span><div><b>${esc(p[2])}</b><small>${esc(p[3])}</small></div></li>`).join("")}</ol>`;
  polEl.querySelectorAll(".ev").forEach((g) => {
    const i = +g.dataset.i, p = POL[i], li = polEl.querySelector(`li[data-i="${i}"]`);
    const on = (ev) => { g.classList.add("on"); li.classList.add("on"); showTip(`<b>${esc(p[2])}</b><span class="mono">${p[0]}</span><small>${esc(p[3])}</small>`, ev); };
    const off = () => { g.classList.remove("on"); li.classList.remove("on"); hideTip(); };
    g.addEventListener("mousemove", on); g.addEventListener("mouseleave", off);
    g.addEventListener("click", (ev) => { on(ev); li.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); });
    g.addEventListener("focus", () => { g.classList.add("on"); li.classList.add("on"); }); g.addEventListener("blur", off);
  });

  // ================= listed names =================
  const stEl = $("stk");
  let sC = "all", sL = "all";
  const listed = Object.values(byId).filter((n) => n.tk && n.L < 6);
  stEl.innerHTML = `<div class="ctl"><div class="cg"><span class="cgl">Country</span><div class="seg" data-g="c"><button data-v="all" aria-pressed="true">All</button><button data-v="us" aria-pressed="false">US</button><button data-v="cn" aria-pressed="false">China</button><button data-v="al" aria-pressed="false">Allies</button></div></div>
    <div class="cg"><span class="cgl">Layer</span><div class="seg" data-g="l"><button data-v="all" aria-pressed="true">All</button>${LAYERS.slice(0, 6).map((L, i) => `<button data-v="${i}" aria-pressed="false">${L.h}</button>`).join("")}</div></div></div>
    <div class="panel tw"><table class="st"><thead><tr><th>Company</th><th>Ticker</th><th>Layer</th><th>What it does</th><th></th></tr></thead><tbody></tbody></table><p class="note" id="stN"></p></div>`;
  function table() {
    const rows = listed.filter((n) => (sC === "all" || n.lane === sC) && (sL === "all" || n.L === +sL)).sort((a, b) => a.L - b.L || LANES.indexOf(a.lane) - LANES.indexOf(b.lane));
    stEl.querySelector("tbody").innerHTML = rows.map((n) => `<tr data-n="${n.id}"><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:${LANEC[n.lane]}"></span><b>${esc(n.id === "mag" ? "JL Mag (rare-earth magnets)" : n.name)}</b></td><td class="mono">${esc(n.tk)}</td><td>${esc(LAYERS[n.L].h)}</td><td style="color:var(--muted);font-size:13px">${esc(n.tag)}</td><td>${n.pg ? `<a href="../${n.pg}" onclick="event.stopPropagation()">Page →</a>` : ""}</td></tr>`).join("");
    stEl.querySelectorAll("tr[data-n]").forEach((tr) => tr.onclick = () => window.__rmapFocus(tr.dataset.n));
    $("stN").textContent = `${rows.length} listed ${rows.length === 1 ? "name" : "names"}. Chinese A-shares (.SS, .SZ) trade in Shanghai and Shenzhen; Hong Kong (.HK) and US listings are easier for overseas investors to reach. Agility's SPAC has not closed yet.`;
  }
  stEl.querySelectorAll(".seg").forEach((sg) => sg.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (sg.dataset.g === "c") sC = b.dataset.v; else sL = b.dataset.v;
    sg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); table();
  });
  table();

  // ================= sources =================
  const SRC = [
    ["IDC via Forbes: humanoid shipments up 432%, China 95% share (Sep 30, 2026)", "https://forbes.com/sites/johnkoetsier/2026/09/30/humanoid-robot-shipments-jump-432-china-has-95-market-share"],
    ["Smart Analytics Global: 1H 2026 humanoid shipments (Aug 10, 2026)", "https://smartanalyticsglobal.com/global-humanoid-robot-shipments-2026-agibot-unitree"],
    ["Counterpoint via Forbes: up to 30,000 so far in 2026 (Aug 20, 2026)", "https://forbes.com/sites/johnkoetsier/2026/08/20/humanoid-robot-shipments-up-300-up-to-30000-so-far-in-2026"],
    ["Embodied Wire: shipments by company, 2025 and H1 2026", "https://embodiedwire.com/humanoid-shipments-by-company"],
    ["IFR World Robotics 2026: China installs 59% of the world's robots", "https://finance.yahoo.com/technology/ai/articles/china-installs-59-percent-worlds-030500965.html"],
    ["CNBC: Unitree prices IPO (Aug 6, 2026)", "https://www.cnbc.com/2026/08/06/chinese-humanoid-robot-maker-unitree-prices-ipo-at-9-billion-valuation.html"],
    ["Tech Times: Unitree closes day one up 460%", "https://techtimes.com/articles/325193/20260821/unitree-ipo-closes-460-valued-50-billion-first-real-price-humanoid-robotics.htm"],
    ["China Biz Insider: Unitree at RMB 201.6B on Sep 10; AgiBot's IPO", "https://chinabizinsider.com/chinas-humanoid-robot-reality-check-unitrees-valuation-reset-and-agibots-ipo-gamble"],
    ["The Robotics Media: AgiBot Hong Kong IPO", "https://theroboticsmedia.com/article/agibot-hong-kong-ipo-40-50-billion-valuation-cicc-citic-morgan-stanley-september-2026"],
    ["UBTech H1 2026 results (Embodied Wire)", "https://embodiedwire.com/ubtech-h1-2026-humanoid-revenue.html"],
    ["Humanoid.guide: the humanoid actuator supplier landscape", "https://humanoid.guide/humanoid-actuator-supplier-landscape"],
    ["Robotichina: humanoid BOM cost breakdown", "https://robotichina.com/humanoid-robot-bom-cost-breakdown.html"],
    ["Edgen: Tesla audits Tuopu, Sanhua and Joyson", "https://edgen.tech/es/news/post/tesla-audits-3-china-suppliers-for-optimus-50000-unit-ramp"],
    ["Embodied Wire: Tesla Optimus V3 tracker", "https://embodiedwire.com/tesla-optimus-v3-production-tracker.html"],
    ["Teslarati: Musk on magnets and the Optimus timeline (Oct 12, 2026)", "https://teslarati.com/elon-musk-tesla-optimus-for-sale-timeline"],
    ["NVIDIA GR00T reference humanoid with Unitree (The Robotics Media)", "https://theroboticsmedia.com/article/nvidia-isaac-gr00t-unitree-h2-plus-humanoid-reference"],
    ["RoboSense H1 2026 results", "https://finance.biggo.com/news/52b5803a-29e7-4c45-a404-d51e5a8d9f1a"],
    ["Reuters: US bans new Chinese humanoid robots (Jul 28, 2026)", "https://www.internazionale.it/ultime-notizie-reuters/2026/07/29/trump-administration-bans-new-chinese-humanoid-robots-to-protect-us-ai-buildout"],
    ["RobotToday: US restrictions on Chinese humanoids, the full map", "https://robottoday.com/article/us-restrictions-on-chinese-humanoid-robots-the-full-map"],
    ["Humanoids Daily: Figure company profile", "https://humanoidsdaily.com/companies/figure"],
    ["Physical Intelligence raises ~$1B at $11B+ (The Robotics Media)", "https://theroboticsmedia.com/article/physical-intelligence-1-billion-series-11-billion-valuation-founders-fund"],
    ["Agility, Figure and Apptronik funding compared", "https://universeblend.blog/agility-figure-apptronik-funding"],
    ["ABB Robotics sale to SoftBank status", "https://industrialroboticshub.com/articles/abb-robotics-softbank-sale"],
  ];
  $("srcs").innerHTML = SRC.map(([t, u]) => `<li><a href="${u}" rel="noopener" target="_blank">${esc(t)}</a></li>`).join("");
  $("foot").textContent = `Hand-edited from public reports as of ${ASOF}. Shipment counts are third-party estimates; supplier links marked "reported" come from press and supply-chain reporting that the companies have not confirmed. For information only, not investment advice.`;
})();
