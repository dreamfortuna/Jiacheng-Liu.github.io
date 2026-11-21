"""Render the static GitHub Pages site from site/profile.json and the two templates."""

import json
import re
from html import escape
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site"
DOCS = ROOT / "docs"
PROFILE = json.loads((SOURCE / "profile.json").read_text(encoding="utf-8"))
PAPERS = PROFILE["papers"]
PROJECTS = PROFILE["projects"]
PROFILES = {"Google Scholar": PROFILE["scholar"], "ResearchGate": PROFILE["researchgate"], "GitHub": PROFILE["github"]}
TABS = {"": "About Me", "projects/": "Projects", "publications/": "Publications",
        "awards/": "Awards", "blogs/": "Blogs", "teams/": "Teams", "hobbies/": "Hobbies"}
SECTIONS = {"glance": "Glance", "projects": "Projects", "publications": "Publications", "news": "News", "about": "About"}


def external(label, url, css=""):
    return f'<a class="{css}" href="{escape(url)}" target="_blank" rel="noopener">{escape(label)}</a>'


def page(route, title, content):
    home = not route
    root = "../" * route.count("/") or "./"
    tab = "projects/" if route.startswith("projects/") else route
    nav = []
    for path, label in TABS.items():
        active = ' class="current" aria-current="page"' if tab == path else ""
        nav.append(f'<li><a href="{root}{path}"{active}>{label}</a></li>')
    nav.append(f'<li><a class="cv-btn" href="{root}file/CV-Jiacheng-Liu.pdf" target="_blank" rel="noopener">CV</a></li>')
    body = content if home else f'<main id="main" class="dk-page">{content}</main>'
    footer_details = ""
    if home:
        latest = external(PAPERS[0]["title"], PAPERS[0]["doi"])
        footer_details = f'''<details class="embed-strip hud-more" id="location-panel">
          <summary>Location &amp; latest work</summary>
          <div class="embed-row"><figure class="globe"><canvas width="300" height="240" aria-hidden="true"></canvas><figcaption>Beijing · Beihang University</figcaption></figure>
          <div class="latest-work"><p class="hud-tag">Latest publication</p>{latest}</div></div></details>'''
    shared = dict(
        root=root, title=escape(title + " · Jiacheng Liu" if not home else "Jiacheng Liu 刘嘉成 · Human–AI Collaboration"),
        mode="lp" if home else "inner-page", backdrop='<div class="hud-bg" aria-hidden="true"></div>' if home else "",
        home_styles='<link rel="stylesheet" href="assets/landing.css"><link rel="stylesheet" href="assets/gimbal.css">' if home else "",
        home_script='<script type="module" src="assets/gimbal.js"></script><script type="module" src="assets/globe.js"></script>' if home else "",
        nav="\n".join(nav), content=body, footer_details=footer_details,
        profiles=" · ".join(external(label,url) for label,url in PROFILES.items()),
    )
    template = Template((SOURCE / "layout.html").read_text(encoding="utf-8"))
    folder = DOCS / route
    folder.mkdir(parents=True, exist_ok=True)
    for light in (False, True):
        label = "深色" if light else "亮色"
        markup = template.substitute(
            **shared, theme="light" if light else "dark", chrome="#f5f6ff" if light else "#070d1d",
            switch_url="index.html" if light else "light.html", switch_label=label)
        if light:
            # Real links also keep the light palette when opening a new tab or browsing without JS.
            markup = re.sub(r'(<a\b[^>]*?\bhref=")([./\w-]+/)"', r'\1\2light.html"', markup)
        rendered = "\n".join(line.rstrip() for line in markup.splitlines()) + "\n"
        if light:
            (folder / "light.html").write_text(rendered, encoding="utf-8")
        else:
            (folder / "index.html").write_text(rendered, encoding="utf-8")
            # Preserve previously shared /night.html URLs, including their section anchors.
            (folder / "night.html").write_text(rendered, encoding="utf-8")


def head(key, title, more="", intro=""):
    num = list(SECTIONS).index(key) + 1
    tag = "At a glance" if key == "glance" else SECTIONS[key]
    variant = " sec-title--lede" if key == "glance" else ""
    link = f'<a class="sec-more" href="{key}/">{more} <span aria-hidden="true">→</span></a>' if more else ""
    lede = f'<p class="sec-lede">{intro}</p>' if intro else ""
    return f'''<header class="sec-head">
      <p class="hud-idx"><span class="hud-no">{num:02}</span><span class="hud-rule"></span><span class="hud-tag">{tag}</span></p>
      <h2 id="{key}-title" class="sec-title{variant}">{title}</h2>{lede}{link}</header>'''


def author_line(paper):
    return ", ".join("<b>Jiacheng Liu</b>" if name == "Jiacheng Liu" else escape(name) for name in paper["authors"])


def paper_row(paper, i):
    return f'''<li class="pub reveal" style="--i:{i}">
      <div class="pub-badge"><span class="venue-pill">{paper["badge"]} {paper["year"]}</span></div>
      <div class="pub-main"><h3 class="pub-title">{external(paper["title"],paper["doi"])}</h3>
      <p class="pub-authors">{author_line(paper)}</p><p class="pub-where">{escape(paper["venue"])}</p>
      <p class="pub-links">{external("DOI",paper["doi"],"hud-chip")}</p></div></li>'''


def tile(project, i):
    slug = project["slug"]
    return f'''<a class="tile {'tile--lg' if i < 2 else ''} hud-frame reveal tilt-card spot-only" href="projects/{slug}/" data-project="{slug}" style="--i:{i}">
      <span class="tile-idx" aria-hidden="true">{i+1:02}</span>
      <figure class="tile-media"><img src="assets/{slug}.webp" width="620" height="388" loading="lazy" alt=""></figure>
      <div class="tile-body"><p class="tile-venue"><span class="tile-dot"></span>{project["period"]}</p>
      <h3 class="tile-title">{escape(project["en"])}</h3><p class="tile-sub">{project["name"]}</p><p class="tile-blurb">{project["role"]}</p>
      <span class="tile-cta">Open project <span aria-hidden="true">→</span></span></div></a>'''


def timeline(date, text, kind=""):
    return f'<li class="tl-item" data-kind="{kind}"><span class="tl-date">{date}</span><span class="tl-dot" aria-hidden="true"></span><div class="tl-body"><p>{text}</p></div></li>'


def home():
    education = "".join(timeline(d, f"<b>{s}</b> · {m}", "now" if i == 0 else "") for i,(d,m,s) in enumerate(PROFILE["education"]))
    interests = "".join(f'<li class="focus-item"><span class="fi-ic" aria-hidden="true">{ic}</span><b>{k}</b><span>{v}</span></li>'
                        for ic,(k,v) in zip("◈◎◉",PROFILE["interests"]))
    stats = [(len(PROJECTS),"Projects","本科阶段科研实践"),(len(PAPERS),"Publications","期刊与会议论文"),
             (len(PROFILE["interests"]),"Research interests","人智协同、类人智能体、人因可靠性")]
    stat_rows = "".join(f'<li class="stat"><b class="num" data-count="{n}">{n}</b><span class="lbl">{k}</span><span class="sub">{v}</span></li>' for n,k,v in stats)
    tiles = "".join(tile(p,i) for i,p in enumerate(PROJECTS))
    index = "".join(f'<li><span class="tile-dot"></span><span class="ti-name">{escape(p["en"])}</span></li>' for p in PROJECTS)
    tiles += f'''<a class="tile tile--all hud-frame reveal tilt-card spot-only" data-project="index" href="projects/">
      <span class="tile-idx" aria-hidden="true">04</span><div class="tile-body"><p class="tile-venue">Index</p>
      <h3 class="tile-title">All projects <span>→</span></h3><ul class="tile-index">{index}</ul>
      <span class="tile-cta">Open the index <span aria-hidden="true">→</span></span></div></a>'''
    news = [timeline(p["year"], f'{external(p["title"],p["doi"])} · {escape(p["venue"])}', "publication") for p in PAPERS[:3]]
    html = Template((SOURCE / "home.html").read_text(encoding="utf-8")).substitute(
        buttons="".join(external(k,v,"btn") for k,v in PROFILES.items()), email=PROFILE["email"],
        venues="".join(f'<li><span class="venue-pill">{v}</span></li>' for v in ("RESS 2026","IEEE T-ITS 2026","ACM 2024","ICRMS 2023")),
        jumps="".join(f'<a href="#{k}"><span class="hud-no">{i:02}</span>{v}</a>' for i,(k,v) in enumerate(SECTIONS.items(),1)),
        glance_head=head("glance","我研究<b>人和智能系统</b>如何共同感知、分配任务，并作出<b>可靠的决策</b>。"),
        projects_head=head("projects","Featured Projects","All projects","智能驾驶监控、航空供氧与脑电交互风险预警。"),
        papers_head=head("publications","Selected Publications","All publications"), news_head=head("news","News &amp; Updates"),
        about_head=head("about","About Me"), stats=stat_rows, interests=interests, tiles=tiles,
        papers="".join(paper_row(p,i) for i,p in enumerate(PAPERS)), news="".join(news), education=education,
        chips="".join(f'<span class="chip">{k}</span>' for k,_ in PROFILE["interests"]),
    )
    page("", "", html)


def project_pages():
    cards = []
    for p in PROJECTS:
        slug = p["slug"]
        img = f'<img src="../assets/{slug}.webp" alt="" width="620" height="388">'
        cards.append(f'''<a class="work-card" href="{slug}/"><div class="thumb">{img}</div><div class="work-copy">
          <small>{p["period"]}</small><h2>{p["name"]}</h2><p>{p["role"]}</p></div></a>''')
        page(f"projects/{slug}/", p["name"], f'''<p class="back"><a href="../">← All projects</a></p>
          <h1>{p["name"]}</h1><p class="hud-tag">{escape(p["en"])} · {p["period"]}</p>
          <figure class="project-cover"><img src="../../assets/{slug}.webp" alt="" width="620" height="388"></figure>
          <h2>个人贡献</h2><p>{p["role"]}</p>''')
    page("projects/", "Projects", '<h1>Projects</h1><p>本科阶段的科研项目与个人贡献。</p><div class="works-grid">'+"".join(cards)+'</div>')


def publication_page():
    def list_group(title, group):
        items = [f'<li><p>{external(p["title"],p["doi"])}<br>{author_line(p)}<br><em>{escape(p["venue"])}</em> · {p["year"]}</p></li>' for p in group]
        return f'<h2>{title}</h2><ul>{"".join(items)}</ul>'
    journals = [p for p in PAPERS if p["badge"] in ("RESS","IEEE T-ITS")]
    confs = [p for p in PAPERS if p not in journals]
    page("publications/", "Publications", '<h1>Publications</h1><p>'+external("Google Scholar",PROFILES["Google Scholar"])+' · '+external("ResearchGate",PROFILES["ResearchGate"])+'</p>'+list_group("Journal Articles",journals)+list_group("Conference Papers",confs))


def other_pages():
    for path,label,empty in [("awards/","Awards","奖项记录待补充。"),("blogs/","Blogs","文章待发布。"),
                             ("teams/","Teams","团队介绍待补充。"),("hobbies/","Hobbies","兴趣与活动待补充。")]:
        page(path,label,f'<h1>{label}</h1><p class="empty-note">{empty}</p>')
    page("credits/","Design credits",'''<h1>设计与署名</h1><h2>亮色版</h2><p>亮色配色沿用深色版的页面与交互。</p>
      <p><a href="../assets/licenses/Inter-OFL.txt">Inter · SIL Open Font License</a>.</p>
      <h2>深色版</h2><p>页面布局与部分页面动效改编自
      <a href="https://github.com/WangYuhang-cmd/WangYuhang-cmd.github.io">Yuhang Wang’s personal website</a>.
      <a href="../assets/licenses/reference-site-MIT.txt">MIT license</a>.</p>
      <p><a href="../assets/licenses/three-MIT.txt">Three.js · MIT</a> · <a href="../assets/licenses/Inter-OFL.txt">Inter · SIL Open Font License</a>.</p>
      <h2>衡枢 · GIMBAL</h2><p>为本主页设计的可变形物理 AI 形象。模型、变形机构与驾驶意图演示均用 Three.js 在浏览器内生成。</p>
      <p>Globe coastlines from <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain).</p>''')


def cv():
    """The PDF behind the CV tab is the A4 print of this self-contained page."""
    education = [f'<p class="row"><b>{school} · {degree}</b><span class="date">{date}</span></p>' for date,degree,school in PROFILE["education"]]
    projects = [f'<div class="row"><b>{p["name"]}</b><span class="date">{p["period"]}</span></div><p>{p["role"]}</p>' for p in PROJECTS]
    papers = [f'<p class="paper">{external(p["title"],p["doi"])}<small>{author_line(p)}. <i>{escape(p["venue"])}</i>, {p["year"]}.</small></p>' for p in (PAPERS[0], PAPERS[1], PAPERS[3])]
    markup = Template((SOURCE / "cv.html").read_text(encoding="utf-8")).substitute(
        email=PROFILE["email"], links=" · ".join(external(k,v) for k,v in PROFILES.items()),
        interests="、".join(k for k,_ in PROFILE["interests"]), education="".join(education),
        projects="".join(projects), papers="".join(papers))
    dest = DOCS / "cv" / "index.html"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(markup, encoding="utf-8")


if __name__ == "__main__":
    home()
    project_pages()
    publication_page()
    other_pages()
    cv()
