"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import styles from "./landing.module.css";

// Public marketing page at "/". A port of cram-landing-page-v4-spaced-home.html: the styles live
// in landing.module.css verbatim, and the three original scripts (sticky header, hero parallax,
// scroll-driven story) are the effects below — scoped to the page ref rather than `document`, so
// they can't reach into the rest of the app.

const LOGO = "/cram-logo.png";

export function LandingPage({ fontClassName }: { fontClassName: string }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const heroVisualRef = useRef<HTMLDivElement>(null);

  // `scroll-behavior: smooth` has to sit on the scrolling element, which the CSS module can't
  // reach without leaking into every route. Set it while the landing page is mounted.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);

  // Sticky-header state + hero tilt, both driven off one rAF-throttled scroll listener.
  useEffect(() => {
    const page = pageRef.current;
    const header = headerRef.current;
    const hero = heroRef.current;
    if (!page || !header || !hero) return;

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function update() {
      header!.classList.toggle(styles.scrolled, window.scrollY > 18);

      if (reducedMotion.matches) return;
      const rect = hero!.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height * 0.7), 0, 1);
      page!.style.setProperty("--hero-progress", progress.toFixed(3));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal-on-enter, and the story steps that drive which scene the sticky stage shows.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const revealElements = page.querySelectorAll<HTMLElement>("[data-reveal]");
    const storySteps = [...page.querySelectorAll<HTMLElement>("[data-story-step]")];

    if (!("IntersectionObserver" in window)) {
      revealElements.forEach((element) => element.classList.add(styles.visible));
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealElements.forEach((element) => revealObserver.observe(element));

    const storyObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visibleEntries.length) return;

        const activeStep = visibleEntries[0].target as HTMLElement;
        storySteps.forEach((step) => step.classList.toggle(styles.active, step === activeStep));
        stageRef.current?.setAttribute("data-state", activeStep.dataset.storyStep ?? "0");
      },
      { rootMargin: "-20% 0px -35% 0px", threshold: [0.2, 0.4, 0.6, 0.8] },
    );
    storySteps.forEach((step) => storyObserver.observe(step));

    return () => {
      revealObserver.disconnect();
      storyObserver.disconnect();
    };
  }, []);

  // Gentle mouse depth on desktop. Scroll still drives the main movement.
  useEffect(() => {
    const heroVisual = heroVisualRef.current;
    const dashboard = dashboardRef.current;
    if (
      !heroVisual ||
      !dashboard ||
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    function onMove(event: MouseEvent) {
      const rect = heroVisual!.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      window.requestAnimationFrame(() => {
        dashboard!.style.marginLeft = `${x * 7}px`;
        dashboard!.style.marginTop = `${y * 5}px`;
      });
    }

    function onLeave() {
      dashboard!.style.marginLeft = "";
      dashboard!.style.marginTop = "";
    }

    heroVisual.addEventListener("mousemove", onMove);
    heroVisual.addEventListener("mouseleave", onLeave);
    return () => {
      heroVisual.removeEventListener("mousemove", onMove);
      heroVisual.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div ref={pageRef} className={`${fontClassName} ${styles.page}`}>
      <header ref={headerRef} className={styles.siteHeader}>
        <div className={`${styles.container} ${styles.nav}`}>
          <a className={styles.brand} href="#top" aria-label="Cram home">
            <img className={styles.brandLogo} src={LOGO} alt="" />
            Cram
          </a>

          <nav className={styles.navLinks} aria-label="Primary navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#connected">Why Cram</a>
            <a href="#devices">iPhone &amp; iPad</a>
          </nav>

          <div className={styles.navActions}>
            <Link className={`${styles.btn} ${styles.btnSecondary}`} href="/login">
              Log in
            </Link>
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/signup">
              Get started
            </Link>
            <button
              className={styles.menuBtn}
              type="button"
              aria-label="Jump to features"
              onClick={() =>
                pageRef.current?.querySelector("#features")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main} id="top">
        {/* ---------------------------------------------------------------- hero */}
        <section ref={heroRef} className={styles.hero} id="hero">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div>
              <div className={styles.eyebrow} data-reveal>
                <span className={styles.eyebrowDot} />
                One connected study system
              </div>

              <h1 data-reveal data-reveal-delay="1">
                Study with
                <br />
                <span className={styles.gradientText}>less friction.</span>
              </h1>

              <p className={styles.heroCopy} data-reveal data-reveal-delay="2">
                Turn your notes into smart flashcards and quizzes, review with spaced repetition, and
                keep every grade in sight. Cram helps you focus on the subject that needs you most.
              </p>

              <div className={styles.heroActions} data-reveal data-reveal-delay="3">
                <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`} href="/signup">
                  Start studying
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12H19M13 6L19 12L13 18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>

                <a className={`${styles.btn} ${styles.btnSecondary} ${styles.btnLg}`} href="#how-it-works">
                  See how Cram works
                </a>
              </div>

              <div className={styles.heroProof} data-reveal data-reveal-delay="3">
                <div className={styles.subjectStack} aria-hidden="true">
                  <span>MA</span>
                  <span>EN</span>
                  <span>PH</span>
                  <span>HI</span>
                </div>
                <span>Maths, English, Physics and every other subject in one place.</span>
              </div>
            </div>

            <div ref={heroVisualRef} className={styles.heroVisual} aria-label="Preview of the Cram dashboard">
              <span className={`${styles.heroOrb} ${styles.one}`} />
              <span className={`${styles.heroOrb} ${styles.two}`} />

              <div ref={dashboardRef} className={styles.dashboardShell}>
                <div className={styles.browserBar}>
                  <div className={styles.browserDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.mockSearch} />
                  <div className={styles.mockProfile} />
                </div>

                <div className={styles.mockLayout}>
                  <aside className={styles.mockSidebar}>
                    <div className={styles.mockLogoRow}>
                      <img src={LOGO} alt="" />
                      Cram
                    </div>
                    <div className={`${styles.mockNav} ${styles.active}`}>Dashboard</div>
                    <div className={styles.mockNav}>Subjects</div>
                    <div className={styles.mockNav}>Review</div>
                    <div className={styles.mockNav}>Quizzes</div>
                    <div className={styles.mockNav}>Flashcards</div>
                    <div className={styles.mockNav}>AI Decks</div>
                    <div className={styles.mockNav}>Progress</div>
                    <div className={styles.mockNav}>Grades</div>
                  </aside>

                  <div className={styles.mockMain}>
                    <div className={styles.mockHero}>
                      <div>
                        <div className={styles.mockKicker}>Good to see you, Tom 👋</div>
                        <h3>Ready for today&apos;s review?</h3>
                        <p>Consistent practice. Smarter repetition. Better results.</p>
                        <span className={styles.mockBtn}>▶ Start study session</span>
                      </div>

                      <div className={styles.studyArt} aria-hidden="true">
                        <div className={styles.blob} />
                        <div className={styles.clipboard}>
                          <div className={styles.checkLine} />
                          <div className={styles.checkLine} />
                          <div className={styles.checkLine} />
                          <div className={styles.checkLine} />
                        </div>
                        <div className={styles.books} />
                        <div className={styles.plant} />
                      </div>
                    </div>

                    <div className={styles.mockStats}>
                      <div className={styles.mockStat}>
                        <strong>8 days</strong>
                        <small>Review streak</small>
                      </div>
                      <div className={styles.mockStat}>
                        <strong>23</strong>
                        <small>Cards due today</small>
                      </div>
                      <div className={styles.mockStat}>
                        <strong>84%</strong>
                        <small>Avg. quiz score</small>
                      </div>
                      <div className={styles.mockStat}>
                        <strong>8 days</strong>
                        <small>Nearest exam</small>
                      </div>
                    </div>

                    <div className={styles.mockSubjects}>
                      <div className={styles.subjectCard}>
                        <div className={styles.subjectHead}>
                          <span className={`${styles.subjectBadge} ${styles.math}`}>MA</span>
                          <strong>Maths</strong>
                        </div>
                        <div className={`${styles.miniProgress} ${styles.blue}`}>
                          <span />
                        </div>
                      </div>

                      <div className={styles.subjectCard}>
                        <div className={styles.subjectHead}>
                          <span className={`${styles.subjectBadge} ${styles.english}`}>EN</span>
                          <strong>English</strong>
                        </div>
                        <div className={`${styles.miniProgress} ${styles.green}`}>
                          <span />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${styles.floatingCard} ${styles.review}`}>
                <small>Cards due today</small>
                <strong>23</strong>
                <div className={styles.tinyRing} />
              </div>

              <div className={`${styles.floatingCard} ${styles.grade}`}>
                <small>Overall average</small>
                <strong>5.2</strong>
                <div style={{ marginTop: 7, color: "#20a956", fontSize: 10, fontWeight: 700 }}>
                  ↑ Improving
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ features */}
        <section className={styles.section} id="features">
          <div className={styles.container}>
            <div className={styles.sectionHeading} data-reveal>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} /> Built around how you study
              </div>
              <h2>Everything you need to get exam-ready.</h2>
              <p>
                Cram keeps the complete study loop in one place instead of making you jump between
                your notes, a flashcard app, a grade tracker and a calendar.
              </p>
            </div>

            <div className={styles.featureGrid}>
              <article className={styles.featureCard} data-reveal>
                <div className={`${styles.iconBox} ${styles.purple}`}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M7 3.5H15L19 7.5V20.5H7V3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M15 3.5V8H19M10 12H16M10 15.5H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <h3>Notes to flashcards</h3>
                <p>
                  Upload notes and slides. Cram turns them into cards and quizzes instantly, linked
                  directly to the right subject.
                </p>
              </article>

              <article className={styles.featureCard} data-reveal data-reveal-delay="1">
                <div className={`${styles.iconBox} ${styles.blue}`}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M18.5 8.5A7 7 0 1 0 19 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M18 4V9H13M6 20V15H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3>Review that sticks</h3>
                <p>
                  Spaced repetition surfaces what matters, right when you need it, so your review
                  time goes to the cards most likely to slip.
                </p>
              </article>

              <article className={styles.featureCard} data-reveal data-reveal-delay="2">
                <div className={`${styles.iconBox} ${styles.pink}`}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 19V10M10 19V5M16 19V8M22 19V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <h3>Grades in one place</h3>
                <p>
                  Add grades to Maths, English, Physics or your own subjects. See subject averages
                  and your overall average automatically.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- scroll story */}
        <section className={styles.scrollStory} id="how-it-works">
          <div className={styles.container}>
            <div className={styles.storyHeading} data-reveal>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} /> Scroll through the study loop
              </div>
              <h2>Watch your material become a study plan.</h2>
              <p>
                This section is scroll-driven. The product scene changes as you move through the
                page, giving the landing page a video-like feeling without needing a video file.
              </p>
            </div>

            <div className={styles.storyLayout}>
              <div className={styles.storySteps}>
                <article className={`${styles.storyStep} ${styles.active}`} data-story-step="0">
                  <span className={styles.storyStepNumber}>01</span>
                  <h3>Upload the material you actually use.</h3>
                  <p>
                    Add a Maths worksheet, English notes, Physics slides or a photo of a textbook
                    page. Everything stays connected to the subject you choose.
                  </p>
                </article>

                <article className={styles.storyStep} data-story-step="1">
                  <span className={styles.storyStepNumber}>02</span>
                  <h3>Cram builds the study content.</h3>
                  <p>
                    AI extracts the key ideas and generates flashcards, quiz questions and a concise
                    summary from your real material.
                  </p>
                </article>

                <article className={styles.storyStep} data-story-step="2">
                  <span className={styles.storyStepNumber}>03</span>
                  <h3>Review exactly what is starting to slip.</h3>
                  <p>
                    Cards return through spaced repetition. Rate each answer Again, Hard, Good or
                    Easy and Cram updates the next review.
                  </p>
                </article>

                <article className={styles.storyStep} data-story-step="3">
                  <span className={styles.storyStepNumber}>04</span>
                  <h3>Your grades become part of the plan.</h3>
                  <p>
                    Add real marks by subject. Cram shows each subject average and your overall
                    average, then uses performance and exam urgency as study context.
                  </p>
                </article>
              </div>

              <div className={styles.storyStageWrap}>
                <div ref={stageRef} className={styles.storyStage} data-state="0">
                  <div className={styles.stageGlow} />

                  <div className={styles.stageTop}>
                    <div className={styles.stageBrand}>
                      <img src={LOGO} alt="" />
                      Cram
                    </div>
                    <div className={styles.stageDots}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>

                  {/* scene 0 — upload */}
                  <div className={`${styles.scene} ${styles.scene0}`}>
                    <div className={styles.sceneKicker}>Add study material</div>
                    <h4>Maths · Algebra exam</h4>

                    <div className={styles.uploadCard}>
                      <div>
                        <div className={styles.uploadIcon}>
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 16V5M8 9L12 5L16 9M6 12H5A3 3 0 0 0 2 15V18A3 3 0 0 0 5 21H19A3 3 0 0 0 22 18V15A3 3 0 0 0 19 12H18"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <strong>Upload your study materials</strong>
                        <span>Drag &amp; drop PDFs, slides or images</span>
                      </div>
                    </div>

                    <div className={styles.fileRow}>
                      <div className={styles.filePill}>📄 Algebra_Notes.pdf</div>
                      <div className={styles.filePill}>📊 Functions.pptx</div>
                      <div className={styles.filePill}>🖼️ Worksheet.jpg</div>
                    </div>
                  </div>

                  {/* scene 1 — AI decks */}
                  <div className={`${styles.scene} ${styles.scene1}`}>
                    <div className={styles.sceneKicker}>AI Decks</div>
                    <h4>Turning your files into a study deck.</h4>

                    <div className={styles.aiBuildCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <strong>Cram is analysing your Maths material...</strong>
                        <span style={{ color: "#c9bdff", fontSize: 11, fontWeight: 650 }}>● Live</span>
                      </div>

                      <div className={styles.buildRail}>
                        <div className={`${styles.buildNode} ${styles.done}`}>
                          <span>✓</span>Ingest
                        </div>
                        <div className={`${styles.buildNode} ${styles.done}`}>
                          <span>✓</span>Extract
                        </div>
                        <div className={`${styles.buildNode} ${styles.activeNode}`}>
                          <span />
                          Generate
                        </div>
                        <div className={styles.buildNode}>
                          <span />
                          Review
                        </div>
                      </div>

                      <div className={styles.generatedGrid}>
                        <div className={styles.generatedCard}>
                          <small>Flashcard preview</small>
                          <strong>What is the quadratic formula?</strong>
                          <p>A formula used to solve equations in the form ax² + bx + c = 0.</p>
                        </div>

                        <div className={styles.generatedCard}>
                          <small>Quiz preview</small>
                          <strong>Which graph represents y = x²?</strong>
                          <p>Four answer choices generated from the uploaded lesson.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* scene 2 — review */}
                  <div className={`${styles.scene} ${styles.scene2}`}>
                    <div className={styles.sceneKicker}>Today&apos;s review</div>
                    <h4>23 cards due · about 18 minutes</h4>

                    <div className={styles.reviewScene}>
                      <div className={styles.flashcard}>
                        <div className={styles.flashcardTop}>
                          <div className={styles.subjectHead} style={{ margin: 0 }}>
                            <span className={`${styles.subjectBadge} ${styles.physics}`}>PH</span>
                            <strong style={{ fontSize: 13 }}>Physics</strong>
                          </div>
                          <span className={styles.topicPill}>Topic: Forces</span>
                        </div>

                        <div className={styles.flashQuestion}>What is Newton&apos;s second law of motion?</div>

                        <div className={styles.reviewActions}>
                          <div className={styles.rating}>
                            Again
                            <br />
                            <span style={{ fontWeight: 500 }}>&lt; 1 min</span>
                          </div>
                          <div className={styles.rating}>
                            Hard
                            <br />
                            <span style={{ fontWeight: 500 }}>5 min</span>
                          </div>
                          <div className={styles.rating}>
                            Good
                            <br />
                            <span style={{ fontWeight: 500 }}>15 min</span>
                          </div>
                          <div className={styles.rating}>
                            Easy
                            <br />
                            <span style={{ fontWeight: 500 }}>4 days</span>
                          </div>
                        </div>
                      </div>

                      <aside className={styles.reviewSide}>
                        <div className={styles.sideMetric}>
                          <small>Cards remaining</small>
                          <strong>16</strong>
                        </div>
                        <div className={styles.sideMetric}>
                          <small>Accuracy</small>
                          <strong style={{ color: "#25ae62" }}>82%</strong>
                        </div>
                        <div className={styles.sideMetric}>
                          <small>Review streak</small>
                          <strong>8 days</strong>
                        </div>
                      </aside>
                    </div>
                  </div>

                  {/* scene 3 — grades */}
                  <div className={`${styles.scene} ${styles.scene3}`}>
                    <div className={styles.sceneKicker}>Grades</div>
                    <h4>Your subjects and averages, connected.</h4>

                    <div className={styles.gradeScene}>
                      <div className={styles.gradeSummary}>
                        <div className={styles.gradeSummaryCard}>
                          <small>Overall average</small>
                          <strong>5.2</strong>
                        </div>
                        <div className={styles.gradeSummaryCard}>
                          <small>Active subjects</small>
                          <strong>4</strong>
                        </div>
                        <div className={styles.gradeSummaryCard}>
                          <small>Target hit</small>
                          <strong style={{ color: "#25ae62" }}>75%</strong>
                        </div>
                      </div>

                      <div className={styles.subjectGradeList}>
                        {[
                          { badge: styles.math, code: "MA", name: "Maths", avg: "5.4", target: "5.5", count: "8" },
                          { badge: styles.english, code: "EN", name: "English", avg: "5.6", target: "5.5", count: "11" },
                          { badge: styles.physics, code: "PH", name: "Physics", avg: "4.8", target: "5.2", count: "7" },
                          { badge: styles.history, code: "HI", name: "History", avg: "5.1", target: "5.3", count: "9" },
                        ].map((row) => (
                          <div key={row.code} className={styles.subjectGrade}>
                            <div className={styles.subjectGradeName}>
                              <span className={`${styles.subjectBadge} ${row.badge}`}>{row.code}</span>
                              {row.name}
                            </div>
                            <div>
                              <small>Average</small>
                              <strong>{row.avg}</strong>
                            </div>
                            <div>
                              <small>Target</small>
                              <strong>{row.target}</strong>
                            </div>
                            <div>
                              <small>Grades</small>
                              <strong>{row.count}</strong>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- connected */}
        <section className={`${styles.section} ${styles.connected}`} id="connected">
          <div className={styles.container}>
            <div className={styles.connectedPanel}>
              <div className={styles.connectedCopy} data-reveal>
                <div className={styles.eyebrow}>
                  <span className={styles.eyebrowDot} /> The Cram difference
                </div>
                <h2>Not just AI flashcards. One connected study system.</h2>
                <p>
                  Cram combines what you remember, how you are actually performing and how close your
                  exam is to help prioritise the next study session.
                </p>

                <div className={styles.logicList}>
                  <div className={styles.logicItem}>
                    <div className={styles.logicIcon}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 8.5A7 7 0 1 1 6 17M5 8.5V4M5 8.5H9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <strong>Memory strength</strong>
                      <span>How well each card is sticking.</span>
                    </div>
                  </div>

                  <div className={styles.logicItem}>
                    <div className={styles.logicIcon}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
                        <path d="M4 19V12M10 19V5M16 19V9M22 19V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <strong>Real grades</strong>
                      <span>Where results are strong and where they are weaker.</span>
                    </div>
                  </div>

                  <div className={styles.logicItem}>
                    <div className={styles.logicIcon}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
                        <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M7 3V7M17 3V7M3.5 9H20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <strong>Exam urgency</strong>
                      <span>How much time is left before the subject matters most.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.connectedVisual} data-reveal data-reveal-delay="1">
                <h3>Cram adapts what you study next</h3>

                <div className={styles.dataFlow}>
                  <div className={styles.dataCard}>
                    <div className={styles.iconBox}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 8.5A7 7 0 1 1 6 17M5 8.5V4M5 8.5H9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <strong>14 Physics cards are slipping</strong>
                      <span>Several Forces cards are due again.</span>
                    </div>
                  </div>

                  <div className={styles.flowArrow} />

                  <div className={styles.dataCard}>
                    <div className={styles.iconBox}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M4 19V12M10 19V5M16 19V9M22 19V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <strong>Physics average: 4.8</strong>
                      <span>Your target is 5.2, so the subject needs more attention.</span>
                    </div>
                  </div>

                  <div className={styles.flowArrow} />

                  <div className={styles.dataCard}>
                    <div className={styles.iconBox}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M7 3V7M17 3V7M3.5 9H20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <strong>Physics exam in 8 days</strong>
                      <span>Cram brings Physics forward in today&apos;s review priority.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- devices */}
        <section className={`${styles.section} ${styles.devices}`} id="devices">
          <div className={styles.container}>
            <div className={styles.sectionHeading} data-reveal>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} /> One account everywhere
              </div>
              <h2>Study at your desk. Continue on your iPhone.</h2>
              <p>
                Your subjects, grades, cards and review progress stay connected across the web app,
                iPhone and iPad.
              </p>
            </div>

            <div className={styles.deviceStage} data-reveal>
              <div className={styles.deviceGlow} />

              <div className={styles.ipad} aria-hidden="true">
                <div className={styles.ipadUi}>
                  <div className={styles.ipadHead}>
                    <div className={styles.ipadSearch} />
                    <div className={styles.ipadProfile} />
                  </div>

                  <div className={styles.ipadTitle}>Subjects</div>

                  <div className={styles.ipadGrid}>
                    <div className={styles.ipadColumn}>
                      <div className={styles.ipadSubject}>
                        <div className={styles.subjectHead}>
                          <span className={`${styles.subjectBadge} ${styles.math}`}>MA</span>
                          <strong>Maths</strong>
                        </div>
                        <div className={`${styles.miniProgress} ${styles.blue}`}>
                          <span />
                        </div>
                      </div>

                      <div className={styles.ipadSubject}>
                        <div className={styles.subjectHead}>
                          <span className={`${styles.subjectBadge} ${styles.english}`}>EN</span>
                          <strong>English</strong>
                        </div>
                        <div className={`${styles.miniProgress} ${styles.green}`}>
                          <span />
                        </div>
                      </div>
                    </div>

                    <div className={styles.ipadColumn}>
                      <div className={styles.ipadSide}>
                        <strong>Today&apos;s review</strong>
                        <div className={styles.ipadRing} />
                      </div>

                      <div className={styles.ipadSide}>
                        <strong>Upcoming exam</strong>
                        <div style={{ marginTop: 18, fontSize: 27, fontWeight: 700, color: "#25ae62" }}>8</div>
                        <div style={{ color: "#8a92a4", fontSize: 9 }}>days left</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.iphone} aria-hidden="true">
                <div className={styles.iphoneUi}>
                  <div className={styles.iphoneTitle}>
                    <img src={LOGO} alt="" />
                    Cram
                  </div>

                  <div className={styles.iphoneGreeting}>Good morning, Tom 👋</div>
                  <div className={styles.iphoneSub}>Ready to make progress today?</div>
                  <div className={styles.iphoneSearch} />

                  <div className={styles.iphoneStats}>
                    <div className={styles.iphoneStat}>
                      <strong>4</strong>
                      <small>Subjects</small>
                    </div>
                    <div className={styles.iphoneStat}>
                      <strong>23</strong>
                      <small>Due today</small>
                    </div>
                    <div className={styles.iphoneStat}>
                      <strong>8</strong>
                      <small>Days</small>
                    </div>
                  </div>

                  <div className={styles.iphoneCard}>
                    <div className={styles.subjectHead}>
                      <span className={`${styles.subjectBadge} ${styles.math}`}>MA</span>
                      <strong>Maths</strong>
                    </div>
                    <div style={{ color: "#8b93a6", fontSize: 8 }}>Your progress</div>
                    <div className={`${styles.miniProgress} ${styles.blue}`}>
                      <span />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#7d8598", fontSize: 8 }}>
                      <span>128 cards</span>
                      <span>18 to review</span>
                      <span>5.4 avg.</span>
                    </div>
                    <div className={styles.iphoneBtn}>Study now →</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- cta */}
        <section className={styles.cta}>
          <div className={styles.container}>
            <div className={styles.ctaPanel} data-reveal>
              <img className={styles.ctaLogo} src={LOGO} alt="Cram" />
              <h2>Stop organising study apps. Start studying.</h2>
              <p>
                Bring your material, grades and exam dates into one place and let Cram turn them into
                a focused study routine.
              </p>

              <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`} href="/signup">
                Create your Cram account
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12H19M13 6L19 12L13 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerRow}`}>
          <a className={styles.brand} href="#top">
            <img className={styles.brandLogo} src={LOGO} alt="" />
            Cram
          </a>

          <div>Study with less friction.</div>

          <div className={styles.footerLinks}>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
