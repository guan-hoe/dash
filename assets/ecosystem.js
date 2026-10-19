/* Datacenter page: animated AI ecosystem map.
   Needs an empty <section id="eco"> on the page. Draws seven layers, left to right:
   tools & IP → chip designers → fab, packaging & memory → racks, network & power → compute providers
   → AI labs & platforms → the broader economy. Particles flow along the links: blue for chips, compute and
   models moving downstream, green for money flowing back upstream. Hover or tap a node to trace its links
   and read what it does; "Play the story" walks the chain one layer at a time. Below it, "One research
   question, end to end" follows a single query through the stack.
   Relationships are from public announcements and filings, edited by hand (see ASOF). No external data. */
(function () {
  const host = document.getElementById("eco");
  if (!host) return;
  const ASOF = "October 2026";
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- the map ----------
  const L = [
    { h: "Tools & IP", c: "--e0", s: "Machines, materials and designs" },
    { h: "Chip designers", c: "--e1", s: "GPUs, custom chips and CPUs" },
    { h: "Fab & memory", c: "--e2", s: "Where the chips are made and fed" },
    { h: "Racks & power", c: "--e3", s: "Turning chips into AI factories" },
    { h: "Compute providers", c: "--e4", s: "Clouds, neoclouds, colocation" },
    { h: "AI labs & platforms", c: "--e5", s: "Train and serve the models" },
    { h: "Broader economy", c: "--e6", s: "Where the work gets done" },
  ];
  // [id, layer, name, tagline, detail, page]
  const N = [
    ["asml", 0, "ASML", "EUV lithography", "Sole maker of the extreme-ultraviolet scanners needed for every leading-edge AI chip. Each new TSMC node and every extra wafer of capacity starts with ASML tools.", "asml/"],
    ["amat", 0, "Applied Materials", "Deposition, etch, packaging", "Builds the machines that lay down and carve the layers on a wafer, plus tools for advanced packaging and HBM memory stacks.", "amat/"],
    ["ter", 0, "Teradyne", "Chip & system test", "Tests GPUs, HBM and custom accelerators before they ship; more complex chips and stacked memory mean more test time per part.", "ter/"],
    ["arm", 0, "Arm", "CPU cores & instruction set", "Licenses the CPU designs inside NVIDIA's Grace and Vera, AWS Graviton, Google Axion and Microsoft Cobalt, the host processors next to the accelerators.", "arm/"],
    ["mp", 0, "MP Materials", "Rare earths & magnets", "US rare-earth mining and magnet making. Magnets go into the motors, fans, pumps and generators that cool and power data centers.", "mp/"],
    ["nvda", 1, "NVIDIA", "GPUs, NVLink, networking", "Designs the dominant AI accelerators (Blackwell, Rubin) and sells them as full racks with NVLink, InfiniBand and Spectrum-X Ethernet. Made at TSMC with HBM from SK hynix and Micron.", "nvda/"],
    ["amd", 1, "AMD", "Instinct GPUs, EPYC CPUs", "The second GPU supplier (MI355, MI450 Helios racks) and a leading server CPU maker. OpenAI, Microsoft, Meta and Oracle are named Instinct customers.", "amd/"],
    ["avgo", 1, "Broadcom", "Custom AI chips, Ethernet", "Co-designs custom accelerators such as Google's TPU and chips for Meta and OpenAI, and makes the Tomahawk and Jericho switch chips that wire AI clusters together.", "avgo/"],
    ["mrvl", 1, "Marvell", "Custom chips, optical DSPs", "Custom silicon for cloud companies and the signal processors inside optical transceivers that connect racks.", "mrvl/"],
    ["intc", 1, "Intel", "Xeon CPUs, foundry", "Xeon host CPUs in many AI servers, Gaudi accelerators, and a foundry business building advanced packaging capacity.", "intc/"],
    ["inhouse", 1, "In-house silicon", "TPU, Trainium, Maia, MTIA", "Hyperscalers design their own accelerators to cut cost per answer: Google TPU, AWS Trainium and Inferentia, Microsoft Maia, Meta MTIA. Built with partners like Broadcom and Marvell, made at TSMC.", ""],
    ["tsm", 2, "TSMC", "Leading-edge wafers, CoWoS", "Makes nearly every leading AI chip and packages GPU dies with HBM using CoWoS. Packaging capacity has been one of the tightest bottlenecks in the chain.", "tsm/"],
    ["skhy", 2, "SK hynix", "HBM memory", "Leading supplier of high-bandwidth memory stacked next to each GPU. Memory bandwidth often limits how fast a model can answer.", "skhy/"],
    ["mu", 2, "Micron", "HBM, DRAM", "The US HBM and DRAM maker, supplying NVIDIA and others; AI servers carry far more memory than ordinary servers.", "mu/"],
    ["sndk", 2, "SanDisk", "Flash storage", "NAND flash and enterprise SSDs that hold training data, checkpoints and the documents models search through.", "sndk/"],
    ["racks", 3, "Racks & networking", "Dell, Supermicro, Foxconn, Arista", "Server makers assemble GPUs, CPUs, memory, liquid cooling and switches into racks of up to 72 GPUs that behave like one computer.", ""],
    ["glw", 3, "Corning", "Optical fiber & connectivity", "Fiber and cabling inside and between AI data centers; GPU clusters need many times the fiber of a normal data hall.", "glw/"],
    ["lite", 3, "Lumentum", "Lasers & optical engines", "Lasers and optical components inside the transceivers and optical circuit switches that move data between GPUs.", "lite/"],
    ["cohr", 3, "Coherent", "Optical transceivers", "800G and 1.6T transceivers and lasers linking racks across the cluster.", "cohr/"],
    ["aaoi", 3, "Applied Optoelectronics", "Optical transceivers", "US-made data center transceivers sold to large cloud operators.", "aaoi/"],
    ["be", 3, "Bloom Energy", "On-site fuel-cell power", "Fuel cells that put power on site in months instead of waiting years for a grid connection.", "be/"],
    ["rok", 3, "Rockwell", "Automation & power control", "Industrial automation, drives and power control for data center buildings and the factories making their equipment.", "rok/"],
    ["grid", 3, "Utilities & grid", "Power and cooling", "Gigawatt-scale grid connections, gas turbines and cooling water. Power is now the main limit on how fast AI capacity can grow.", ""],
    ["msft", 4, "Microsoft Azure", "Fairwater AI sites", "Second-largest cloud. Runs OpenAI's models and offers Anthropic's, and sells AI through Copilot and Azure AI Foundry.", "msft/"],
    ["amzn", 4, "Amazon AWS", "Trainium & NVIDIA", "Largest cloud. Runs Anthropic training on Trainium (Project Rainier) and signed a multi-year compute deal with OpenAI.", "amzn/"],
    ["googl", 4, "Google Cloud", "TPUs & NVIDIA", "Runs its own TPUs and NVIDIA GPUs for Gemini and for customers including Anthropic.", "googl/"],
    ["meta", 4, "Meta", "Own data centers", "Builds giant clusters (Prometheus, Hyperion) for its own models and ads, and rents extra capacity from neoclouds.", "meta/"],
    ["orcl", 4, "Oracle OCI", "Stargate sites", "Builds Stargate capacity for OpenAI, such as Abilene in Texas.", ""],
    ["crwv", 4, "CoreWeave", "GPU neocloud", "Specialist GPU cloud with large contracts from OpenAI, Microsoft and Meta.", ""],
    ["nbis", 4, "Nebius", "GPU neocloud", "GPU cloud with multi-year capacity deals with Microsoft and Meta.", ""],
    ["colo", 4, "Equinix · Digital Realty", "Colocation", "Lease space, power and interconnection to clouds and enterprises that run AI in their own racks.", ""],
    ["spcx", 4, "SpaceX AI (xAI)", "Colossus, Memphis", "Owns and runs the Colossus GPU clusters behind Grok.", "spcx/"],
    ["openai", 5, "OpenAI", "ChatGPT, API", "Trains GPT models on Azure, Oracle, CoreWeave and AWS capacity and has chip deals with NVIDIA, AMD and Broadcom.", ""],
    ["anthropic", 5, "Anthropic", "Claude, API", "Trains and serves Claude on AWS Trainium, Google TPUs and NVIDIA GPUs, sold directly and through AWS Bedrock, Google Vertex AI and Microsoft Foundry.", ""],
    ["deepmind", 5, "Google DeepMind", "Gemini, AlphaFold", "Builds Gemini on Google's TPUs and science models such as AlphaFold.", ""],
    ["metaai", 5, "Meta AI", "Llama, Meta AI app", "Meta's models power its assistant, ad ranking and recommendations across its apps.", ""],
    ["xai", 5, "xAI", "Grok", "Trains Grok on the Colossus clusters; now part of SpaceX.", ""],
    ["pltr", 5, "Palantir", "AI platform (AIP)", "Applies models to a company's or government's own data and workflows, a main path from models to operations.", "pltr/"],
    ["zs", 5, "Zscaler", "Security for AI traffic", "Inspects and secures employee and agent traffic to AI apps, so companies can adopt AI safely.", "zs/"],
    ["research", 6, "Research & science", "Literature, data, discovery", "Reading and summarising papers, running analyses, protein and materials design; work that took weeks of reading can be scoped in hours.", ""],
    ["finance", 6, "Finance & analysis", "Research, models, reports", "Earnings and filing analysis, financial models, due diligence and reporting drafts that analysts then check.", ""],
    ["software", 6, "Software engineering", "Coding agents", "Writing, testing and reviewing code; coding is one of the largest uses of AI models today.", ""],
    ["health", 6, "Healthcare & life sciences", "Notes, imaging, drugs", "Clinical documentation, imaging support and drug discovery.", ""],
    ["industry", 6, "Manufacturing & robotics", "Design, planning, robots", "Design, supply-chain planning, maintenance and the models steering robots.", ""],
    ["service", 6, "Customer service & operations", "Agents for routine work", "Support, back-office processing and internal search handled by AI agents with people handling exceptions.", ""],
    ["public", 6, "Government & defense", "Analysis & logistics", "Intelligence analysis, logistics and public services, often through platforms like Palantir.", ""],
    ["consumer", 6, "Consumers & education", "Assistants, learning", "Everyday assistants, search, tutoring and creative tools used by hundreds of millions of people.", ""],
  ];
  // links: [from, to, what moves downstream]
  const E = [
    ["asml", "tsm", "EUV scanners"], ["amat", "tsm", "Wafer & packaging tools"], ["amat", "skhy", "Memory tools"], ["amat", "mu", "Memory tools"],
    ["ter", "skhy", "HBM test"], ["ter", "tsm", "Chip test"], ["arm", "nvda", "Grace / Vera CPU cores"], ["arm", "inhouse", "Graviton, Axion, Cobalt cores"], ["mp", "racks", "Magnets for fans & pumps"], ["mp", "grid", "Generator magnets"],
    ["nvda", "tsm", "GPU designs"], ["amd", "tsm", "GPU & CPU designs"], ["avgo", "tsm", "Custom chip designs"], ["mrvl", "tsm", "Custom chip designs"], ["inhouse", "tsm", "TPU, Trainium, Maia, MTIA"],
    ["avgo", "racks", "Ethernet switch chips"], ["mrvl", "cohr", "Optical DSPs"], ["intc", "racks", "Xeon host CPUs"],
    ["tsm", "racks", "Packaged GPUs & accelerators"], ["skhy", "racks", "HBM"], ["mu", "racks", "HBM & DRAM"], ["sndk", "racks", "SSDs"],
    ["lite", "cohr", "Lasers"], ["lite", "racks", "Optical engines"], ["cohr", "racks", "Transceivers"], ["aaoi", "racks", "Transceivers"], ["glw", "colo", "Fiber"], ["glw", "msft", "Fiber"], ["glw", "meta", "Fiber"],
    ["racks", "msft", "AI racks"], ["racks", "amzn", "AI racks"], ["racks", "googl", "AI racks"], ["racks", "meta", "AI racks"], ["racks", "orcl", "AI racks"], ["racks", "crwv", "AI racks"], ["racks", "nbis", "AI racks"], ["racks", "spcx", "AI racks"],
    ["be", "orcl", "On-site power"], ["be", "colo", "On-site power"], ["rok", "colo", "Power & building control"], ["grid", "msft", "Power"], ["grid", "amzn", "Power"], ["grid", "googl", "Power"], ["grid", "meta", "Power"], ["grid", "colo", "Power"], ["grid", "spcx", "Power"],
    ["msft", "openai", "Compute"], ["msft", "anthropic", "Compute"], ["orcl", "openai", "Stargate compute"], ["crwv", "openai", "GPU capacity"], ["amzn", "openai", "Compute"], ["amzn", "anthropic", "Trainium compute"], ["googl", "anthropic", "TPU compute"], ["googl", "deepmind", "TPU compute"],
    ["meta", "metaai", "Compute"], ["crwv", "metaai", "GPU capacity"], ["nbis", "metaai", "GPU capacity"], ["spcx", "xai", "Colossus compute"], ["colo", "pltr", "Hosting"], ["colo", "zs", "Hosting"], ["msft", "pltr", "Models & cloud"], ["amzn", "pltr", "Models & cloud"],
    ["openai", "research", "Deep research"], ["openai", "finance", "Analysis"], ["openai", "software", "Codex"], ["openai", "consumer", "ChatGPT"], ["openai", "service", "Agents"],
    ["anthropic", "software", "Claude Code"], ["anthropic", "research", "Research"], ["anthropic", "finance", "Analysis"], ["anthropic", "service", "Agents"], ["anthropic", "health", "Life sciences"],
    ["deepmind", "research", "AlphaFold, Gemini"], ["deepmind", "health", "Drug discovery"], ["deepmind", "consumer", "Gemini app"], ["metaai", "consumer", "Meta AI"], ["xai", "consumer", "Grok"],
    ["pltr", "public", "AIP"], ["pltr", "industry", "AIP"], ["pltr", "finance", "AIP"], ["pltr", "health", "AIP"], ["zs", "finance", "Secure AI use"], ["zs", "public", "Secure AI use"], ["zs", "industry", "Secure AI use"],
  ];
  const STORY = [
    { l: [0], t: "It starts with tools and IP. ASML's EUV scanners, Applied Materials' process tools and Teradyne's testers decide how many leading-edge chips the world can make; Arm supplies the CPU cores that sit beside the accelerators." },
    { l: [1], t: "Chip designers turn that into AI silicon. NVIDIA and AMD sell GPUs as whole racks; Broadcom and Marvell co-design custom chips (Google TPU, AWS Trainium, Microsoft Maia, Meta MTIA) so the biggest buyers can cut cost per answer." },
    { l: [2], t: "Almost all of it is made at TSMC, then packaged with stacks of HBM memory from SK hynix and Micron. Packaging and memory have been the tightest bottlenecks, which is why memory prices and TSMC capacity move the whole chain." },
    { l: [3], t: "Chips become racks: dozens of GPUs, liquid cooling, switches and miles of fiber and optics acting as one computer. Then they need power. Grid connections, gas turbines and on-site fuel cells now set the pace of new capacity." },
    { l: [4], t: "Hyperscalers, neoclouds and colocation firms own the AI factories. They spend hundreds of billions a year on capex and rent the capacity out, much of it to a handful of AI labs under multi-year contracts." },
    { l: [5], t: "AI labs train models on that compute and serve them through chat apps and APIs; platforms like Palantir connect models to a company's own data, and security firms like Zscaler make it safe to use." },
    { l: [6], t: "The output lands in the wider economy: research and analysis, coding, finance, healthcare, customer operations, government and everyday consumers. This is where AI saves time and creates value." },
    { l: [0, 1, 2, 3, 4, 5, 6], m: "money", t: "Then the money flows back. Users and companies pay for subscriptions and API calls; labs pay clouds for compute; clouds spend that on racks, chips, memory and power; chip makers pay TSMC; TSMC buys ASML's tools. Whether end-user revenue keeps up with this capex is the key question for the trade." },
  ];
  const STEPS = [
    ["You", "A research question", "\"How exposed is TSMC to HBM supply?\" goes in as a prompt, plus any files you attach."],
    ["App & API", "AI lab's model service", "The request reaches the lab's API, which picks a model and adds tools: web search, file reading, code to run analyses."],
    ["Cloud region", "Hyperscaler or neocloud", "A load balancer sends it to a nearby region with spare GPUs. Many users' requests are batched together so each GPU stays busy."],
    ["GPU rack", "Accelerators + HBM + NVLink", "The model runs: weights stream from HBM, GPUs exchange data over NVLink and optics, and repeated context is cached instead of recomputed."],
    ["Power & cooling", "Grid, turbines, liquid loops", "Each answer draws a little energy; at scale that adds up to gigawatts, which is why power is the limit on new capacity."],
    ["Answer", "Research & analysis", "Sources read, numbers pulled and a draft analysis returned in minutes, for a person to check and decide on."],
  ];

  // ---------- styles ----------
  const st = document.createElement("style");
  st.textContent = `
  :root{--e0:#8b5cf6;--e1:#2563eb;--e2:#0891b2;--e3:#0d9488;--e4:#d97706;--e5:#db2777;--e6:#16a34a;--flow:#2b7fd0;--cash:#13804b}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--e0:#a78bfa;--e1:#60a5fa;--e2:#22d3ee;--e3:#2dd4bf;--e4:#fbbf24;--e5:#f472b6;--e6:#4ade80;--flow:#5fb0f0;--cash:#3ccf86}}
  :root[data-theme="dark"]{--e0:#a78bfa;--e1:#60a5fa;--e2:#22d3ee;--e3:#2dd4bf;--e4:#fbbf24;--e5:#f472b6;--e6:#4ade80;--flow:#5fb0f0;--cash:#3ccf86}
  #eco .eco-bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;margin:0 0 10px}
  #eco .seg{display:inline-flex;gap:4px;flex-wrap:wrap}
  #eco .seg button,#eco .ctl button{font:500 12px var(--f-mono);border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:5px 10px;border-radius:4px;cursor:pointer}
  #eco .seg button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  #eco button:focus-visible,#eco .nd:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #eco .ctl{display:inline-flex;gap:4px;align-items:center}
  #eco .scroller{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding:0 4px}
  #eco svg.map{display:block;width:100%;min-width:980px;height:auto}
  #eco .colh{font:600 10.5px var(--f-mono);letter-spacing:.06em;text-transform:uppercase}
  #eco .cols{font:400 10.5px var(--f-body);fill:var(--muted)}
  #eco .ed{stroke-opacity:.8}
  #eco .ed{fill:none;stroke:var(--line);stroke-width:1.2;transition:stroke .2s,opacity .2s}
  #eco .nd rect{fill:var(--panel);stroke:var(--line);stroke-width:1;transition:opacity .2s,stroke .2s}
  #eco .nd .bar{stroke:none}
  #eco .nd text{font:600 11.5px var(--f-body);fill:var(--ink);pointer-events:none}
  #eco .nd text.tg{font:400 9.5px var(--f-mono);fill:var(--muted)}
  #eco .nd{cursor:pointer;transition:opacity .2s}
  #eco .nd:hover rect.bx{stroke:var(--muted)}
  #eco .p{pointer-events:none}
  #eco .p.f{fill:var(--flow)}#eco .p.m{fill:var(--cash)}
  #eco svg.dim .nd:not(.on){opacity:.22}
  #eco svg.dim .ed:not(.on){opacity:.12}
  #eco svg.dim .ed.on{stroke:var(--muted);stroke-width:1.8}
  #eco svg.dim .p:not(.on){opacity:0}
  #eco .nd.sel rect.bx{stroke:var(--accent);stroke-width:2}
  #eco .info{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;margin-top:12px}
  @media (max-width:820px){#eco .info{grid-template-columns:minmax(0,1fr)}}
  #eco .card h3{font:600 16px var(--f-body);margin:0 0 2px}
  #eco .card .tg{font:500 11px var(--f-mono);color:var(--muted);letter-spacing:.04em}
  #eco .card p{margin:8px 0 0;font-size:14px;line-height:1.55}
  #eco .lk{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:10px}
  #eco .lk span{font:500 11px var(--f-mono);border:1px solid var(--line);border-radius:3px;padding:2px 6px;color:var(--muted)}
  #eco .lk b{font-weight:600;color:var(--ink)}
  #eco .story .k{font:600 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  #eco .story p{margin:6px 0 0;font-size:14.5px;line-height:1.6;min-height:4.8em}
  #eco .dots{display:flex;gap:5px;margin-top:10px}
  #eco .dots i{width:18px;height:4px;border-radius:2px;background:var(--line)}
  #eco .dots i.on{background:var(--accent)}
  #eco .leg{display:flex;flex-wrap:wrap;gap:6px 16px;font:500 11px var(--f-mono);color:var(--muted);margin-top:8px}
  #eco .leg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
  #eco .q{margin-top:28px}
  #eco .q h3{font:600 17px var(--f-body);margin:0 0 4px}
  #eco svg.lane{display:block;width:100%;min-width:760px;height:auto}
  #eco .st rect{fill:var(--panel);stroke:var(--line)}
  #eco .st.on rect{stroke:var(--accent);stroke-width:2;fill:var(--accent-soft)}
  #eco .st text{font:600 12px var(--f-body);fill:var(--ink)}
  #eco .st text.s{font:400 10px var(--f-mono);fill:var(--muted)}
  #eco .lane .trk{fill:none;stroke:var(--line);stroke-width:2;stroke-dasharray:4 5}
  #eco .tok{fill:var(--accent)}
  #eco .qcap{font-size:14.5px;line-height:1.6;margin:10px 0 0;min-height:3.2em}
  #eco .qcap b{font-weight:600}
  #eco .eff{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px}
  #eco .eff div{border:1px solid var(--line);border-radius:5px;padding:10px 12px;font-size:13px;color:var(--muted);background:var(--panel)}
  #eco .eff b{display:block;font:600 13px var(--f-body);color:var(--ink);margin-bottom:2px}
  `;
  document.head.appendChild(st);

  // ---------- layout ----------
  const W = 1160, COLW = W / L.length, NW = 146, NH = 40, GAP = 10, TOP = 58;
  const byLayer = L.map((_, i) => N.filter((n) => n[1] === i));
  const maxN = Math.max(...byLayer.map((a) => a.length));
  const H = TOP + maxN * (NH + GAP) + 10;
  const pos = {};
  byLayer.forEach((arr, li) => {
    const total = arr.length * (NH + GAP) - GAP, y0 = TOP + (maxN * (NH + GAP) - GAP - total) / 2;
    arr.forEach((n, k) => { pos[n[0]] = { x: COLW * li + (COLW - NW) / 2, y: y0 + k * (NH + GAP), l: li }; });
  });
  const node = Object.fromEntries(N.map((n) => [n[0], n]));
  const edges = E.filter(([a, b]) => pos[a] && pos[b]).map(([a, b, w], i) => {
    const A = pos[a], B = pos[b];
    const p0 = [A.x + NW, A.y + NH / 2], p3 = [B.x, B.y + NH / 2];
    let c1, c2;
    if (A.l === B.l) { // same layer: loop out to the right
      const dx = NW * 0.45; p3[0] = B.x + NW; c1 = [p0[0] + dx, p0[1]]; c2 = [p3[0] + dx, p3[1]];
    } else { const dx = (p3[0] - p0[0]) * 0.5; c1 = [p0[0] + dx, p0[1]]; c2 = [p3[0] - dx, p3[1]]; }
    return { a, b, w, i, P: [p0, c1, c2, p3] };
  });
  const bz = (P, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };

  // ---------- markup ----------
  host.innerHTML = `
    <h2 id="ecoH">The AI ecosystem</h2>
    <p class="sub">How the pieces connect, from the machines that make chips to the work AI does across the economy. Blue particles are chips, compute and models moving downstream; green is money flowing back. Hover or tap any company to trace its links; open a stock page from its card.</p>
    <div class="eco-bar">
      <div class="seg" role="group" aria-label="Flows">
        <button type="button" data-m="goods" aria-pressed="true">Chips &amp; compute</button><button type="button" data-m="money" aria-pressed="false">Money</button><button type="button" data-m="both" aria-pressed="false">Both</button>
      </div>
      <div class="ctl"><button type="button" data-a="story">▶ Play the story</button><button type="button" data-a="pause" aria-pressed="false">Pause motion</button></div>
    </div>
    <div class="panel">
      <div class="scroller"><svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ecoH"></svg></div>
      <div class="leg"><span><i style="background:var(--flow)"></i>Chips, compute, models</span><span><i style="background:var(--cash)"></i>Money (capex, compute contracts, subscriptions)</span><span>Scroll sideways on a phone</span></div>
    </div>
    <div class="info">
      <div class="panel card" aria-live="polite"></div>
      <div class="panel story"><div class="k">The chain in eight steps</div><p></p><div class="dots"></div>
        <div class="ctl" style="margin-top:10px"><button type="button" data-a="prev">← Prev</button><button type="button" data-a="next">Next →</button><button type="button" data-a="reset">Show all</button></div></div>
    </div>
    <div class="q">
      <h3>One research question, end to end</h3>
      <p class="sub">What happens across the stack when you ask an AI model to research and analyse something. Click a station to stop on it.</p>
      <div class="panel"><div class="scroller"><svg class="lane" viewBox="0 0 1120 150" aria-label="Path of one AI query"></svg></div><p class="qcap" aria-live="polite"></p></div>
      <div class="eff">
        <div><b>Batching</b>One GPU serves many users' requests at once, so the cost of each answer falls as traffic grows.</div>
        <div><b>Caching</b>Context that repeats (a long document, a system prompt) is stored and reused instead of recomputed.</div>
        <div><b>Right-sized models</b>Simple steps go to small, cheap models; hard reasoning goes to large ones.</div>
        <div><b>Custom inference chips</b>TPU, Trainium, Maia and MTIA trade flexibility for lower cost and power per answer.</div>
      </div>
    </div>
    <p class="note">Relationships as of ${ASOF}, from company announcements, filings and earnings calls; simplified to the main links, not every contract. Not investment advice.</p>`;

  const svg = host.querySelector("svg.map"), NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };
  // column headers
  L.forEach((l, i) => {
    const cx = COLW * i + COLW / 2;
    mk("rect", { x: COLW * i + 8, y: 8, width: COLW - 16, height: 3, rx: 1.5, fill: `var(${l.c})` });
    const t = mk("text", { x: cx, y: 28, "text-anchor": "middle", class: "colh", fill: `var(${l.c})` }); t.textContent = l.h;
    const s = mk("text", { x: cx, y: 42, "text-anchor": "middle", class: "cols" }); s.textContent = l.s;
    const tt = mk("title", {}, s); tt.textContent = l.s;
  });
  const gE = mk("g", {}), gP = mk("g", {}), gN = mk("g", {});
  edges.forEach((e) => { e.el = mk("path", { d: `M${e.P[0]} C${e.P[1]} ${e.P[2]} ${e.P[3]}`, class: "ed" }, gE); const t = mk("title", {}, e.el); t.textContent = `${node[e.a][2]} → ${node[e.b][2]}: ${e.w}`; });
  N.forEach((n) => {
    const p = pos[n[0]], g = mk("g", { class: "nd", tabindex: 0, role: "button", "aria-label": `${n[2]}: ${n[3]}`, transform: `translate(${p.x},${p.y})` }, gN);
    mk("rect", { class: "bx", width: NW, height: NH, rx: 5 }, g);
    mk("rect", { class: "bar", width: 3.5, height: NH - 10, x: 4, y: 5, rx: 1.5, fill: `var(${L[n[1]].c})` }, g);
    const t1 = mk("text", { x: 13, y: 17 }, g); t1.textContent = n[2].length > 21 ? n[2].slice(0, 20) + "…" : n[2];
    const t2 = mk("text", { x: 13, y: 31, class: "tg" }, g); t2.textContent = n[3].length > 23 ? n[3].slice(0, 22) + "…" : n[3];
    const tt = mk("title", {}, g); tt.textContent = `${n[2]} · ${n[3]}`;
    n.el = g;
    g.addEventListener("mouseenter", () => { if (!pinned) focus(n[0]); });
    g.addEventListener("mouseleave", () => { if (!pinned) focus(null); });
    g.addEventListener("focus", () => { if (!pinned) focus(n[0]); });
    g.addEventListener("click", (ev) => { ev.stopPropagation(); pin(pinned === n[0] ? null : n[0]); });
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pin(pinned === n[0] ? null : n[0]); } if (ev.key === "Escape") pin(null); });
  });
  svg.addEventListener("click", () => pin(null));

  // ---------- particles ----------
  let mode = "goods", paused = reduce, layersOn = null;
  const parts = [];
  edges.forEach((e) => {
    const n = 1 + (e.i % 3 === 0 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      parts.push({ e, dir: 1, t: Math.random(), v: 0.0016 + Math.random() * 0.0012, el: mk("circle", { r: 3, class: "p f" }, gP) });
      parts.push({ e, dir: -1, t: Math.random(), v: 0.0013 + Math.random() * 0.001, el: mk("circle", { r: 2.8, class: "p m" }, gP) });
    }
  });
  function placeAll() {
    parts.forEach((p) => {
      const show = (p.dir > 0 ? mode !== "money" : mode !== "goods") && (!layersOn || (layersOn.has(pos[p.e.a].l) || layersOn.has(pos[p.e.b].l)));
      p.el.style.display = show ? "" : "none";
      if (!show) return;
      const [x, y] = bz(p.e.P, p.dir > 0 ? p.t : 1 - p.t);
      p.el.setAttribute("cx", x.toFixed(1)); p.el.setAttribute("cy", y.toFixed(1));
    });
  }
  let visible = true, last = 0;
  function frame(ts) {
    const dt = last ? Math.min(50, ts - last) : 16; last = ts;
    if (!paused && visible && !document.hidden) { parts.forEach((p) => { p.t = (p.t + p.v * dt / 16) % 1; }); placeAll(); }
    requestAnimationFrame(frame);
  }
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(svg);
  placeAll(); requestAnimationFrame(frame);

  // ---------- focus, cards, story ----------
  let pinned = null;
  const card = host.querySelector(".card");
  function links(id) {
    const ins = edges.filter((e) => e.b === id), outs = edges.filter((e) => e.a === id);
    return { ins, outs };
  }
  function focus(id) {
    const set = new Set(), es = new Set();
    if (id) { set.add(id); edges.forEach((e) => { if (e.a === id || e.b === id) { set.add(e.a); set.add(e.b); es.add(e); } }); }
    else if (layersOn) { N.forEach((n) => { if (layersOn.has(n[1])) set.add(n[0]); }); edges.forEach((e) => { if (layersOn.has(pos[e.a].l) || layersOn.has(pos[e.b].l)) es.add(e); }); }
    const dim = !!id || (!!layersOn && layersOn.size < L.length);
    svg.classList.toggle("dim", dim);
    N.forEach((n) => { n.el.classList.toggle("on", set.has(n[0])); n.el.classList.toggle("sel", n[0] === id); });
    edges.forEach((e) => e.el.classList.toggle("on", es.has(e)));
    parts.forEach((p) => p.el.classList.toggle("on", es.has(p.e)));
    showCard(id);
  }
  function pin(id) { pinned = id; focus(id); }
  function showCard(id) {
    if (!id) {
      card.innerHTML = `<div class="tg">Explore</div><h3>Pick any company</h3><p>Each box is a company or group. Its links show who it buys from and sells to. Chips flow left to right into data centers, compute flows to AI labs, and models flow out into the economy. Money runs the other way and funds the next round of spending.</p>`;
      return;
    }
    const n = node[id], { ins, outs } = links(id);
    const nm = (k) => esc(node[k][2]);
    card.innerHTML = `<div class="tg" style="color:var(${L[n[1]].c})">${esc(L[n[1]].h)}</div><h3>${esc(n[2])}</h3><div class="tg">${esc(n[3])}</div><p>${esc(n[4])}</p>
      ${ins.length ? `<div class="lk"><span><b>Gets from</b></span>${ins.map((e) => `<span>${nm(e.a)} · ${esc(e.w)}</span>`).join("")}</div>` : ""}
      ${outs.length ? `<div class="lk"><span><b>Supplies</b></span>${outs.map((e) => `<span>${nm(e.b)} · ${esc(e.w)}</span>`).join("")}</div>` : ""}
      ${n[5] ? `<p><a href="../${n[5]}">Open the ${esc(n[2])} stock page →</a></p>` : ""}`;
  }
  const story = host.querySelector(".story p"), dots = host.querySelector(".dots");
  dots.innerHTML = STORY.map(() => "<i></i>").join("");
  let si = -1, timer = null;
  function step(i) {
    si = Math.max(0, Math.min(STORY.length - 1, i));
    const s = STORY[si];
    layersOn = new Set(s.l); pinned = null;
    setMode(s.m || (si === STORY.length - 1 ? "money" : "goods"));
    focus(null);
    story.textContent = s.t;
    dots.querySelectorAll("i").forEach((d, k) => d.classList.toggle("on", k <= si));
  }
  function resetStory() { stopPlay(); si = -1; layersOn = null; story.textContent = "Press ▶ Play the story, or step through it, to walk the chain from chip tools to the economy and back."; dots.querySelectorAll("i").forEach((d) => d.classList.remove("on")); setMode("goods"); focus(null); }
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; } host.querySelector('[data-a="story"]').textContent = "▶ Play the story"; }
  function play() {
    if (timer) { stopPlay(); return; }
    if (paused && !reduce) togglePause(false);
    step(si + 1 >= STORY.length ? 0 : si + 1);
    host.querySelector('[data-a="story"]').textContent = "■ Stop";
    timer = setInterval(() => { if (si >= STORY.length - 1) { stopPlay(); return; } step(si + 1); }, 7000);
  }
  function setMode(m) { mode = m; host.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m)); placeAll(); }
  function togglePause(v) { paused = v == null ? !paused : v; const b = host.querySelector('[data-a="pause"]'); b.setAttribute("aria-pressed", paused); b.textContent = paused ? "Resume motion" : "Pause motion"; }
  host.querySelectorAll(".seg button").forEach((b) => b.onclick = () => setMode(b.dataset.m));
  host.querySelector('[data-a="story"]').onclick = play;
  host.querySelector('[data-a="pause"]').onclick = () => togglePause();
  host.querySelector('[data-a="prev"]').onclick = () => { stopPlay(); step(si - 1); };
  host.querySelector('[data-a="next"]').onclick = () => { stopPlay(); step(si + 1); };
  host.querySelector('[data-a="reset"]').onclick = resetStory;
  if (reduce) togglePause(true);
  resetStory();

  // ---------- one query, end to end ----------
  const lane = host.querySelector("svg.lane"), cap = host.querySelector(".qcap");
  const SW = 150, SH = 54, SY = 30, gapX = (1120 - 20 - STEPS.length * SW) / (STEPS.length - 1);
  const sx = STEPS.map((_, i) => 10 + i * (SW + gapX));
  const lk = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); (p || lane).appendChild(e); return e; };
  const yMid = SY + SH / 2;
  lk("path", { class: "trk", d: `M${sx[0] + SW / 2},${yMid} L${sx[STEPS.length - 1] + SW / 2},${yMid}` });
  lk("path", { class: "trk", d: `M${sx[STEPS.length - 1] + SW / 2},${SY + SH} C${sx[STEPS.length - 1] + SW / 2},${SY + SH + 50} ${sx[0] + SW / 2},${SY + SH + 50} ${sx[0] + SW / 2},${SY + SH}` });
  const ret = lk("text", { x: 560, y: SY + SH + 46, "text-anchor": "middle", class: "cols" }); ret.textContent = "answer returns to you · the next question starts the loop again";
  const sts = STEPS.map((s, i) => {
    const g = lk("g", { class: "st", transform: `translate(${sx[i]},${SY})`, tabindex: 0, role: "button", "aria-label": `${s[0]}: ${s[1]}`, style: "cursor:pointer" });
    lk("rect", { width: SW, height: SH, rx: 6 }, g);
    const a = lk("text", { x: 10, y: 22 }, g); a.textContent = `${i + 1}. ${s[0]}`;
    const b = lk("text", { x: 10, y: 39, class: "s" }, g); b.textContent = s[1].length > 26 ? s[1].slice(0, 25) + "…" : s[1];
    g.addEventListener("click", () => { qHold = qHold === i ? null : i; qShow(i); qT = i / (STEPS.length - 1); });
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); g.dispatchEvent(new Event("click")); } });
    return g;
  });
  const tok = lk("circle", { r: 6, class: "tok", cy: yMid, cx: sx[0] + SW / 2 });
  let qT = 0, qHold = null, qCur = -1;
  function qShow(i) {
    if (i === qCur) return; qCur = i;
    sts.forEach((g, k) => g.classList.toggle("on", k === i));
    cap.innerHTML = `<b>${esc(STEPS[i][0])} · ${esc(STEPS[i][1])}.</b> ${esc(STEPS[i][2])}`;
  }
  let qLast = 0;
  function qFrame(ts) {
    const dt = qLast ? Math.min(50, ts - qLast) : 16; qLast = ts;
    if (!paused && visible2 && !document.hidden && qHold == null) {
      qT += dt / 16 * 0.0011; if (qT > 1.12) qT = 0;
      const t = Math.min(1, qT), x0 = sx[0] + SW / 2, x1 = sx[STEPS.length - 1] + SW / 2;
      tok.setAttribute("cx", (x0 + (x1 - x0) * t).toFixed(1));
      qShow(Math.min(STEPS.length - 1, Math.round(t * (STEPS.length - 1))));
    } else if (qHold != null) { tok.setAttribute("cx", (sx[qHold] + SW / 2).toFixed(1)); qShow(qHold); }
    requestAnimationFrame(qFrame);
  }
  let visible2 = true;
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => { visible2 = en[0].isIntersecting; }).observe(lane);
  qShow(0); requestAnimationFrame(qFrame);
})();
