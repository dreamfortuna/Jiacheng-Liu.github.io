"""Build both language editions of the static GitHub Pages portfolio."""

import json
import posixpath
import re
from hashlib import sha256
from html import escape
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site"
DOCS = ROOT / "docs"
BASE = "https://dreamfortuna.github.io/Jiacheng-Liu.github.io/"
TABS = {"": "home", "projects/": "projects", "publications/": "publications",
        "awards/": "awards", "blogs/": "blogs", "teams/": "teams", "hobbies/": "hobbies"}
SECTIONS = ["glance", "projects", "publications", "news", "about"]
TEMPLATES = {name: Template((SOURCE / (name + ".html")).read_text("utf-8"))
             for name in ("layout", "home", "cv")}


def localized(value, lang):
    if isinstance(value, list):
        return [localized(item, lang) for item in value]
    if isinstance(value, dict):
        if "en" in value or "zh" in value:
            if set(value) != {"en", "zh"}:
                raise ValueError(f"Incomplete translation: {value}")
            return value[lang]
        return {key: localized(item, lang) for key, item in value.items()}
    return value


def versioned(path):
    digest = sha256((DOCS / path).read_text("utf-8").encode()).hexdigest()[:12]
    return f"{path}?v={digest}"


def external(label, url, css=""):
    return f'<a class="{css}" href="{escape(url)}" target="_blank" rel="noopener">{escape(label)}</a>'


def timeline(date, text, kind):
    return f'<li class="tl-item" data-kind="{kind}"><span class="tl-date">{date}</span><span class="tl-dot" aria-hidden="true"></span><div class="tl-body"><p>{text}</p></div></li>'


def authors(paper):
    return ", ".join("<b>Jiacheng Liu</b>" if name == "Jiacheng Liu" else escape(name) for name in paper["authors"])


class Edition:
    def __init__(self, lang, copy, profile):
        self.lang = lang
        self.t = localized(copy, lang)
        self.data = localized(profile, lang)
        self.projects = self.data["projects"]
        self.papers = self.data["papers"]
        self.prefix, self.other = ("", "zh/") if lang == "en" else ("zh/", "")
        self.html_lang, self.other_lang = ("en", "zh-CN") if lang == "en" else ("zh-CN", "en")
        self.language_name = "中文" if lang == "en" else "English"
        self.pdf = "file/CV-Jiacheng-Liu-en.pdf" if lang == "en" else "file/CV-Jiacheng-Liu.pdf"
        self.profiles = [(self.t["scholar"], self.data["scholar"]), ("ResearchGate", self.data["researchgate"]),
                         ("GitHub", self.data["github"])]

    def profile_links(self, css=""):
        return ("" if css else " · ").join(external(label, url, css) for label, url in self.profiles)

    def page(self, route, title, content):
        t = self.t
        home = not route
        root = "../" * route.count("/") or "./"
        folder = self.prefix + route
        assets = "../" * folder.count("/") or "./"
        other = posixpath.relpath(self.other + route or ".", folder or ".") + "/"
        tab = "projects/" if route.startswith("projects/") else route
        nav = []
        for path, key in TABS.items():
            active = ' class="current" aria-current="page"' if tab == path else ""
            nav.append(f'<li><a href="{root}{path}"{active}>{t[key]}</a></li>')
        nav.append(f'<li><a class="cv-btn" href="{assets}{self.pdf}" target="_blank" rel="noopener">{t["cv"]}</a></li>')
        footer = ""
        if home:
            latest = self.papers[0]
            footer = f'''<details class="embed-strip hud-more" id="location-panel">
              <summary>{escape(t["location_latest"])}</summary>
              <div class="embed-row"><figure class="globe"><canvas width="300" height="240" aria-hidden="true"></canvas><figcaption>{t["beijing_school"]}</figcaption></figure>
              <div class="latest-work"><p class="hud-tag">{t["latest"]}</p>{external(latest["title"], latest["doi"])}</div></div></details>'''
        shared = dict(t, root=root, assets=assets, html_lang=self.html_lang, other_lang=self.other_lang,
                      other_dark=other+"index.html", other_light=other+"light.html", language_name=self.language_name,
                      english_url=BASE+route, chinese_url=BASE+"zh/"+route, canonical=BASE+folder,
                      page_title=escape(t["site_title"] if home else f'{title} · {t["name"]}'),
                      mode="lp" if home else "inner-page", backdrop='<div class="hud-bg" aria-hidden="true"></div>' if home else "",
                      home_styles=(f'<link rel="stylesheet" href="{assets}assets/landing.css"><link rel="stylesheet" href="{assets}{versioned("assets/mech.css")}">' if home else ""),
                      home_script=(f'<script type="module" src="{assets}{versioned("assets/mech.js")}"></script><script type="module" src="{assets}assets/globe.js"></script>' if home else ""),
                      site_css=versioned("style.css"), theme_js=versioned("assets/day.js"),
                      nav="\n".join(nav), content=content if home else f'<main id="main" class="dk-page">{content}</main>',
                      footer_details=footer, profiles=self.profile_links())
        dest = DOCS / folder
        dest.mkdir(parents=True, exist_ok=True)
        for light in (False, True):
            markup = TEMPLATES["layout"].substitute(shared, theme="light" if light else "dark",
                        chrome="#f5f6ff" if light else "#070d1d", switch_url="index.html" if light else "light.html",
                        switch_label=t["to_dark" if light else "to_light"], language_href=other+("light.html" if light else "index.html"))
            if light:
                # Relative directory links stay within this language, including without JavaScript.
                markup = re.sub(r'(<a\b[^>]*?\bhref=")([./\w-]+/)"', r'\1\2light.html"', markup)
            markup = "\n".join(line.rstrip() for line in markup.splitlines()) + "\n"
            for file in (("light.html",) if light else ("index.html", "night.html")):
                (dest / file).write_text(markup, encoding="utf-8")

    def head(self, key, title, more="", intro=""):
        t = self.t
        tag = t[key]
        variant = " sec-title--lede" if key == "glance" else ""
        link = f'<a class="sec-more" href="{key}/">{more} <span aria-hidden="true">→</span></a>' if more else ""
        lede = f'<p class="sec-lede">{intro}</p>' if intro else ""
        return f'''<header class="sec-head">
          <p class="hud-idx"><span class="hud-no">{SECTIONS.index(key)+1:02}</span><span class="hud-rule"></span><span class="hud-tag">{tag}</span></p>
          <h2 id="{key}-title" class="sec-title{variant}">{title}</h2>{lede}{link}</header>'''

    def paper_row(self, p, i):
        return f'''<li class="pub reveal" style="--i:{i}">
          <div class="pub-badge"><span class="venue-pill">{p["badge"]} {p["year"]}</span></div>
          <div class="pub-main"><h3 class="pub-title">{external(p["title"],p["doi"])}</h3>
          <p class="pub-authors">{authors(p)}</p><p class="pub-where">{escape(p["venue"])}</p>
          <p class="pub-links">{external("DOI",p["doi"],"hud-chip")}</p></div></li>'''

    def tile(self, p, i, assets):
        slug = p["slug"]
        return f'''<a class="tile {'tile--lg' if i < 2 else ''} hud-frame reveal tilt-card spot-only" href="projects/{slug}/" data-project="{slug}" style="--i:{i}">
          <span class="tile-idx" aria-hidden="true">{i+1:02}</span>
          <figure class="tile-media"><img src="{assets}assets/{slug}.webp" width="620" height="388" loading="lazy" alt=""></figure>
          <div class="tile-body"><p class="tile-venue"><span class="tile-dot"></span>{p["period"]}</p>
          <h3 class="tile-title">{escape(p["short"])}</h3><p class="tile-sub">{escape(p["name"])}</p><p class="tile-blurb">{p["role"]}</p>
          <span class="tile-cta">{self.t["open_project"]} <span aria-hidden="true">→</span></span></div></a>'''

    def home(self):
        t, data = self.t, self.data
        assets = "../" if self.prefix else "./"
        education = "".join(timeline(d, f"<b>{s}</b> · {m}", "now" if i == 0 else "") for i,(d,m,s) in enumerate(data["education"]))
        interests = "".join(f'<li class="focus-item"><span class="fi-ic" aria-hidden="true">{ic}</span><b>{k}</b><span>{v}</span></li>'
                            for ic,(k,v) in zip("◈◎◉",data["interests"]))
        subject_names = t["join"].join(k for k,_ in data["interests"])
        stats = [(len(self.projects),t["projects"],t["undergrad"]),(len(self.papers),t["publications"],t["published"]),
                 (len(data["interests"]),t["research"],subject_names)]
        stat_rows = "".join(f'<li class="stat"><b class="num" data-count="{n}">{n}</b><span class="lbl">{k}</span><span class="sub">{v}</span></li>' for n,k,v in stats)
        tiles = "".join(self.tile(p,i,assets) for i,p in enumerate(self.projects))
        index = "".join(f'<li><span class="tile-dot"></span><span class="ti-name">{escape(p["short"])}</span></li>' for p in self.projects)
        tiles += f'''<a class="tile tile--all hud-frame reveal tilt-card spot-only" data-project="index" href="projects/">
          <span class="tile-idx" aria-hidden="true">04</span><div class="tile-body"><p class="tile-venue">{t["index_label"]}</p>
          <h3 class="tile-title">{t["all_projects"]} <span>→</span></h3><ul class="tile-index">{index}</ul>
          <span class="tile-cta">{t["open_index"]} <span aria-hidden="true">→</span></span></div></a>'''
        news = "".join(timeline(p["year"], f'{external(p["title"],p["doi"])} · {escape(p["venue"])}', "publication") for p in self.papers[:3])
        html = TEMPLATES["home"].substitute(t, assets=assets, buttons=self.profile_links("btn"), email=data["email"],
            first_line=escape(t["type_lines"][0]), line_json=escape(json.dumps(t["type_lines"],ensure_ascii=False),quote=True),
            venues="".join(f'<li><span class="venue-pill">{v}</span></li>' for v in ("RESS 2026","IEEE T-ITS 2026","ACM 2024","ICRMS 2023")),
            jumps="".join(f'<a href="#{k}"><span class="hud-no">{i:02}</span>{t[k]}</a>' for i,k in enumerate(SECTIONS,1)),
            glance_head=self.head("glance",t["glance_title"]), projects_head=self.head("projects",t["featured"],t["all_projects"],t["project_intro"]),
            papers_head=self.head("publications",t["selected"],t["all_publications"]), news_head=self.head("news",escape(t["updates"])),
            about_head=self.head("about",t["home"]), stats=stat_rows, interests=interests, tiles=tiles,
            papers="".join(self.paper_row(p,i) for i,p in enumerate(self.papers)), news=news, education=education,
            chips="".join(f'<span class="chip">{k}</span>' for k,_ in data["interests"]))
        self.page("", "", html)

    def project_pages(self):
        t=self.t
        assets="../" if self.prefix else ""
        cards=[]
        for p in self.projects:
            slug=p["slug"]
            img=f'<img src="../{assets}assets/{slug}.webp" alt="" width="620" height="388">'
            cards.append(f'''<a class="work-card" href="{slug}/"><div class="thumb">{img}</div><div class="work-copy">
              <small>{p["period"]}</small><h2>{p["name"]}</h2><p>{p["role"]}</p></div></a>''')
            self.page(f"projects/{slug}/",p["name"],f'''<p class="back"><a href="../">← {t["all_projects"]}</a></p>
              <h1>{p["name"]}</h1><p class="hud-tag">{p["period"]}</p>
              <figure class="project-cover"><img src="../../{assets}assets/{slug}.webp" alt="" width="620" height="388"></figure>
              <h2>{t["contribution"]}</h2><p>{p["role"]}</p>''')
        self.page("projects/",t["projects"],f'<h1>{t["projects"]}</h1><p>{t["projects_description"]}</p><div class="works-grid">'+"".join(cards)+'</div>')

    def publication_page(self):
        t=self.t
        def group(title,papers):
            items=[f'<li><p>{external(p["title"],p["doi"])}<br>{authors(p)}<br><em>{escape(p["venue"])}</em> · {p["year"]}</p></li>' for p in papers]
            return f'<h2>{title}</h2><ul>{"".join(items)}</ul>'
        journals=[p for p in self.papers if p["badge"] in ("RESS","IEEE T-ITS")]
        profiles=" · ".join(external(label,url) for label,url in self.profiles[:2])
        self.page("publications/",t["publications"],f'<h1>{t["publications"]}</h1><p>{profiles}</p>'+group(t["journals"],journals)+group(t["conferences"],[p for p in self.papers if p not in journals]))

    def other_pages(self):
        t=self.t
        for key,note in (("awards","award_empty"),("blogs","blog_empty"),("teams","team_empty"),("hobbies","hobby_empty")):
            self.page(key+"/",t[key],f'<h1>{t[key]}</h1><p class="empty-note">{t[note]}</p>')
        licenses=("../../" if self.prefix else "../")+"assets/licenses/"
        self.page("credits/",t["credits"],f'''<h1>{t["credits"]}</h1><h2>{t["light"]}</h2><p>{t["credit_light"]}</p>
          <h2>{t["dark"]}</h2><p>{t["credit_design"]} <a href="https://github.com/WangYuhang-cmd/WangYuhang-cmd.github.io">{t["credit_source"]}</a>
          · <a href="{licenses}reference-site-MIT.txt">{t["mit"]}</a></p>
          <p><a href="{licenses}three-MIT.txt">Three.js · {t["mit"]}</a> · <a href="{licenses}Inter-OFL.txt">Inter · {t["font_license"]}</a></p>
          <h2>{t["model"]}</h2><p>{t["credit_model"]}</p>
          <p>{t["coastline"]} <a href="https://www.naturalearthdata.com/">Natural Earth</a> {t["public_domain"]}</p>''')

    def cv(self):
        t=self.t
        education=[f'<p class="row"><b>{school} · {degree}</b><span class="date">{date}</span></p>' for date,degree,school in self.data["education"]]
        projects=[f'<div class="row"><b>{p["name"]}</b><span class="date">{p["period"]}</span></div><p>{p["role"]}</p>' for p in self.projects]
        papers=[f'<p class="paper">{external(p["title"],p["doi"])}<small>{authors(p)}. <i>{escape(p["venue"])}</i>, {p["year"]}.</small></p>' for p in (self.papers[0],self.papers[1],self.papers[3])]
        folder=self.prefix+"cv/"
        html=TEMPLATES["cv"].substitute(t, html_lang=self.html_lang,other_lang=self.other_lang,language_name=self.language_name,
                other_cv=posixpath.relpath(self.other+"cv/index.html",folder),pdf=posixpath.relpath(self.pdf,folder),
                email=self.data["email"],links=self.profile_links(),interests=t["join"].join(k for k,_ in self.data["interests"]),
                education_title=t["education"],education="".join(education),projects="".join(projects),papers="".join(papers))
        dest=DOCS/folder/"index.html";dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(html,encoding="utf-8")


if __name__=="__main__":
    copy=json.loads((SOURCE/"copy.json").read_text("utf-8"))
    profile=json.loads((SOURCE/"profile.json").read_text("utf-8"))
    for lang in ("en","zh"):
        edition=Edition(lang,copy,profile)
        edition.home()
        edition.project_pages()
        edition.publication_page()
        edition.other_pages()
        edition.cv()
