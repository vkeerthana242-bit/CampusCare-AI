import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Bell, BookOpen, CalendarDays, Check,
  ChevronDown, CircleHelp, Clock3, FileText, GraduationCap, Menu, MessageCircle,
  Moon, Search, ShieldCheck, Sparkles, Sun, X,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const quickQuestions = [
  { label: 'Class Schedule', icon: CalendarDays, prompt: 'What is the class schedule?' },
  { label: 'Exam Dates', icon: Clock3, prompt: 'When are the exam dates?' },
  { label: 'Attendance Rules', icon: ShieldCheck, prompt: 'What are the attendance rules?' },
  { label: 'College Notices', icon: Bell, prompt: 'What are the latest college notices?' },
];
const greeting = {
  role: 'assistant',
  content: "Hi there! I'm CampusCare, your campus companion. Ask me about schedules, exams, attendance, notices, or anything else about college life.",
  time: 'Just now',
};

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('Cannot reach CampusCare right now. Check that the backend is running and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.');
  return data;
}

async function fetchNotices(search = '', category = 'all') {
  const params = new URLSearchParams({ search, category });
  return request(`/api/notices?${params.toString()}`);
}

function ModeBadge({ mode, connected }) {
  const isAI = mode === 'bedrock';
  return (
    <span className={`mode-badge ${connected === false ? 'mode-offline' : isAI ? 'mode-ai' : 'mode-demo'}`} title={connected === true ? 'Backend connected' : connected === false ? 'Backend unavailable' : 'Checking backend connection'}>
      <span className="mode-dot" />
      {connected === false ? 'API offline' : connected === null ? 'Connecting…' : isAI ? 'AI mode' : 'Demo mode'}
    </span>
  );
}

function Avatar({ small = false }) {
  return <div className={`avatar ${small ? 'avatar-small' : ''}`} aria-hidden="true"><Sparkles size={small ? 14 : 17} /></div>;
}

function App() {
  const [mode, setMode] = useState('demo');
  const [connected, setConnected] = useState(null);
  const [messages, setMessages] = useState([greeting]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState('');
  const [noticeError, setNoticeError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [campusData, setCampusData] = useState({ guide: null, schedule: null, exams: null, attendance: null });
  const [campusDataLoading, setCampusDataLoading] = useState(true);
  const [campusDataError, setCampusDataError] = useState('');
  const [noticeData, setNoticeData] = useState(null);
  const [noticeListLoading, setNoticeListLoading] = useState(true);
  const [noticeListError, setNoticeListError] = useState('');
  const [noticeSearch, setNoticeSearch] = useState('');
  const [noticeCategory, setNoticeCategory] = useState('all');
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function loadHealth() {
      try {
        const data = await request('/api/health');
        if (!active) return;
        setMode(data.mode || 'demo');
        setConnected(true);
      } catch {
        if (active) setConnected(false);
      }
    }
    void loadHealth();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCampusData() {
      setCampusDataLoading(true);
      setCampusDataError('');
      try {
        const paths = ['/api/campus-guide', '/api/schedule', '/api/exams', '/api/attendance'];
        const results = await Promise.allSettled(paths.map((path) => request(path)));
        if (!active) return;
        const keys = ['guide', 'schedule', 'exams', 'attendance'];
        const next = { guide: null, schedule: null, exams: null, attendance: null };
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') next[keys[index]] = result.value;
        });
        setCampusData(next);
        if (results.some((result) => result.status === 'rejected')) {
          setCampusDataError('Some campus information could not be loaded. Check the API connection and retry.');
        }
      } catch {
        if (active) setCampusDataError('Campus information could not be loaded. Check the API connection and retry.');
      } finally {
        if (active) setCampusDataLoading(false);
      }
    }
    void loadCampusData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setNoticeListLoading(true);
    setNoticeListError('');
    async function loadNotices() {
      try {
        const data = await fetchNotices();
        if (active) setNoticeData(data);
      } catch (requestError) {
        if (active) setNoticeListError(requestError.message);
      } finally {
        if (active) setNoticeListLoading(false);
      }
    }
    void loadNotices();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, chatLoading]);

  async function sendQuestion(text = question) {
    const value = text.trim();
    if (!value || chatLoading) return;
    const userMessage = { role: 'user', content: value, time: 'Just now' };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setError('');
    setChatLoading(true);
    try {
      const data = await request('/api/chat', { method: 'POST', body: JSON.stringify({ question: value }) });
      setMode(data.mode || mode);
      setConnected(true);
      setMessages((current) => [...current, { role: 'assistant', content: data.answer, time: 'Just now' }]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }

  async function summarizeNotice(event) {
    event.preventDefault();
    if (!notice.trim() || summaryLoading) return;
    setSummary('');
    setNoticeError('');
    setSummaryLoading(true);
    try {
      const data = await request('/api/summarize', { method: 'POST', body: JSON.stringify({ notice: notice.trim() }) });
      setSummary(data.summary);
      setMode(data.mode || mode);
      setConnected(true);
    } catch (requestError) {
      setNoticeError(requestError.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function searchNotices(event) {
    event.preventDefault();
    setNoticeListLoading(true);
    setNoticeListError('');
    try {
      setNoticeData(await fetchNotices(noticeSearch.trim(), noticeCategory));
    } catch (requestError) {
      setNoticeListError(requestError.message);
    } finally {
      setNoticeListLoading(false);
    }
  }

  async function changeNoticeCategory(event) {
    const category = event.target.value;
    setNoticeCategory(category);
    setNoticeListLoading(true);
    setNoticeListError('');
    try {
      setNoticeData(await fetchNotices(noticeSearch.trim(), category));
    } catch (requestError) {
      setNoticeListError(requestError.message);
    } finally {
      setNoticeListLoading(false);
    }
  }

  function retryCampusData() {
    setCampusDataLoading(true);
    setCampusDataError('');
    Promise.allSettled(['/api/campus-guide', '/api/schedule', '/api/exams', '/api/attendance'].map((path) => request(path)))
      .then((results) => {
        const keys = ['guide', 'schedule', 'exams', 'attendance'];
        const next = { guide: null, schedule: null, exams: null, attendance: null };
        results.forEach((result, index) => { if (result.status === 'fulfilled') next[keys[index]] = result.value; });
        setCampusData(next);
        if (results.some((result) => result.status === 'rejected')) setCampusDataError('Some campus information could not be loaded. Check the API connection and retry.');
      })
      .finally(() => setCampusDataLoading(false));
  }

  return (
    <div className={darkMode ? 'app-shell theme-dark' : 'app-shell'}>
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <a className="brand-home" href="#home" onClick={() => setMobileMenuOpen(false)}>
            <span className="brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></span>
            <span className="brand-name">CampusCare<span>AI</span></span>
          </a>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-label">YOUR CAMPUS</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#home" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><MessageCircle size={17} /></span>Ask CampusCare</a>
          <a className="nav-item" href="#campus-guide" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><BookOpen size={17} /></span>Campus guide</a>
          <a className="nav-item" href="#class-schedule" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><CalendarDays size={17} /></span>Class schedule</a>
          <a className="nav-item" href="#exam-dates" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><Clock3 size={17} /></span>Exam dates</a>
          <a className="nav-item" href="#attendance-rules" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><ShieldCheck size={17} /></span>Attendance rules</a>
          <a className="nav-item" href="#college-notices" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><Bell size={17} /></span>College notices</a>
          <a className="nav-item" href="#notice-summarizer" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><FileText size={17} /></span>Notice summarizer</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="help-card">
          <div className="help-icon"><CircleHelp size={18} /></div>
          <strong>Need a hand?</strong>
          <p>Your campus questions, answered in one friendly place.</p>
          <a href="#chat">Start a conversation <ArrowRight size={14} /></a>
        </div>
        <div className="sidebar-footer"><span className="footer-avatar">S</span><span><strong>Student space</strong><small>Here for your campus day</small></span><ChevronDown size={15} /></div>
      </aside>

      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-content" id="home">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>CampusCare</span><span className="breadcrumb-slash">/</span><strong>Ask CampusCare</strong></div>
          <div className="topbar-actions"><ModeBadge mode={mode} connected={connected} /><button className="icon-button theme-toggle" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDarkMode((current) => !current)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><span className="top-avatar">S</span></div>
        </header>

        <div className="page-container">
          <section className="hero-section">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR FRIENDLY CAMPUS GUIDE</div>
              <h1>Your campus,<br /><span>made simpler.</span></h1>
              <p>From class schedules to confusing notices, get clear answers and spend less time searching.</p>
              <a className="hero-link" href="#chat">Ask your first question <ArrowDown size={15} /></a>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="art-card art-card-top"><span className="art-card-icon calendar-art"><CalendarDays size={17} /></span><span><b>{campusData.schedule?.classes?.[0]?.course || (campusDataLoading ? 'Loading class' : 'Class schedule')}</b><small>{campusData.schedule?.classes?.[0] ? `${campusData.schedule.classes[0].day} · ${campusData.schedule.classes[0].time}` : 'From your campus guide'}</small></span><span className="art-check"><Check size={13} /></span></div>
              <div className="art-main"><div className="art-sparkle"><Sparkles size={25} /></div><span className="art-main-small">YOUR CAMPUS COMPANION</span><strong>Here to help<br />you thrive.</strong><span className="art-wave">✳</span></div>
              <div className="art-card art-card-bottom"><span className="art-card-icon notice-art"><Bell size={17} /></span><span><b>{noticeData?.notices?.[0]?.title || (noticeListLoading ? 'Loading notice' : 'College notices')}</b><small>{noticeData?.notices?.[0]?.date || 'From the campus noticeboard'}</small></span><span className="art-arrow"><ArrowRight size={15} /></span></div>
              <span className="art-spark spark-a">✦</span><span className="art-spark spark-b">✳</span>
            </div>
          </section>

          <section className="quick-section" id="quick-questions">
            <div className="section-heading"><div><span className="section-kicker">A GOOD PLACE TO START</span><h2>What can I help with?</h2></div><span className="fictional-note"><span /> Sample campus info</span></div>
            <div className="quick-grid">
              {quickQuestions.map(({ label, icon: Icon, prompt }, index) => <button className="quick-card" key={label} disabled={chatLoading} onClick={() => { document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' }); sendQuestion(prompt); }}><span className={`quick-icon quick-icon-${index}`}><Icon size={18} /></span><span className="quick-label">{label}</span><ArrowRight className="quick-arrow" size={16} /></button>)}
            </div>
          </section>

          <section className="work-grid">
            <div className="panel chat-panel" id="chat">
              <div className="panel-header"><div className="panel-title-wrap"><span className="panel-icon chat-title-icon"><MessageCircle size={17} /></span><div><h2>Ask CampusCare</h2><p>Your campus questions, answered</p></div></div><span className="online-label"><span /> Ready to help</span></div>
              <div className="chat-messages" aria-live="polite" aria-label="Chat messages">
                {messages.map((message, index) => <div className={`message-row ${message.role === 'user' ? 'message-user' : ''}`} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' && <Avatar small />}
                  <div className="message-content"><div className="message-bubble">{message.content}</div><span className="message-time">{message.time}</span></div>
                  {message.role === 'user' && <span className="user-message-avatar">S</span>}
                </div>)}
                {chatLoading && <div className="message-row"><Avatar small /><div className="message-content"><div className="message-bubble typing-bubble"><span /><span /><span /></div><span className="message-time">CampusCare is thinking...</span></div></div>}
                <div ref={chatEndRef} />
              </div>
              {error && <div className="inline-error" role="alert">{error}</div>}
              <form className="chat-form" onSubmit={(event) => { event.preventDefault(); sendQuestion(); }}>
                <input ref={chatInputRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about your campus..." aria-label="Your campus question" disabled={chatLoading} />
                <button type="submit" aria-label="Send question" disabled={!question.trim() || chatLoading}><ArrowUp size={18} /></button>
              </form>
              <div className="chat-footnote"><ShieldCheck size={13} /> Answers are based on campus info. Always double-check important dates.</div>
            </div>

            <div className="panel notice-panel" id="notice-summarizer">
              <div className="panel-header notice-header"><div className="panel-title-wrap"><span className="panel-icon notice-title-icon"><FileText size={17} /></span><div><h2>Notice, made simple</h2><p>Turn official-speak into the essentials</p></div></div><span className="new-tag">QUICK TOOL</span></div>
              <form className="notice-form" onSubmit={summarizeNotice}>
                <label htmlFor="notice-text">PASTE A COLLEGE NOTICE</label>
                <textarea id="notice-text" value={notice} onChange={(event) => { setNotice(event.target.value); setNoticeError(''); }} placeholder={'Paste the full notice here...\n\nFor example, an exam timetable update or a student event announcement.'} rows={6} />
                <div className="notice-form-meta"><span>{notice.length} characters</span><span>Private to this session</span></div>
                <button className="summarize-button" type="submit" disabled={!notice.trim() || summaryLoading}>{summaryLoading ? <><span className="button-spinner" /> Summarizing...</> : <><Sparkles size={16} /> Summarize notice <ArrowRight size={15} /></>}</button>
              </form>
              {noticeError && <div className="inline-error notice-inline-error" role="alert">{noticeError}</div>}
              {summary && <div className="summary-result" aria-live="polite"><div className="summary-result-title"><span><Sparkles size={14} /></span><strong>Here's the short version</strong></div><p>{summary}</p><span className="summary-mode">Generated in {mode === 'bedrock' ? 'AI mode' : 'Demo mode'}</span></div>}
              {!summary && !noticeError && <div className="notice-tip"><span className="tip-icon">✦</span><p><strong>Good to know</strong> Paste a notice in any format. We'll pull out the key dates, actions, and details.</p></div>}
            </div>
          </section>

          <section className="campus-data-section" aria-labelledby="campus-guide-title">
            <div className="section-heading data-section-heading" id="campus-guide">
              <div><span className="section-kicker">YOUR CAMPUS, AT A GLANCE</span><h2 id="campus-guide-title">Campus guide</h2></div>
              {campusData.guide?.fictional && <span className="fictional-note"><span /> Fictional demo campus</span>}
            </div>
            {campusDataLoading && <div className="data-state"><span className="button-spinner" /> Loading campus guide...</div>}
            {campusDataError && <div className="inline-error data-error" role="alert">{campusDataError}<button type="button" onClick={retryCampusData}>Retry</button></div>}
            {campusData.guide && <>
              <div className="panel guide-overview">
                <div className="guide-overview-copy"><span className="section-kicker">{campusData.guide.campus_name}</span><h3>Find the campus info you need.</h3><p>Schedules, exam dates, student expectations, and current notices—all in one place.</p></div>
                <div className="guide-link-grid">{campusData.guide.sections.map((section) => <a className="guide-link-card" href={`#${section.id === 'schedule' ? 'class-schedule' : section.id === 'exams' ? 'exam-dates' : section.id === 'attendance' ? 'attendance-rules' : 'college-notices'}`} key={section.id}><strong>{section.title}</strong><span>{section.description}</span><ArrowRight size={15} /></a>)}</div>
              </div>
              <div className="data-panels-grid">
                <section className="panel data-panel" id="class-schedule">
                  <div className="data-panel-heading"><span className="panel-icon chat-title-icon"><CalendarDays size={17} /></span><div><h3>Class Schedule</h3><p>Weekly classes and locations</p></div></div>
                  {campusData.schedule ? <div className="data-list">{campusData.schedule.classes.map((item) => <div className="data-row" key={`${item.day}-${item.time}-${item.course}`}><span className="data-day">{item.day}</span><span className="data-main"><strong>{item.course}</strong><small>{item.location}</small></span><span className="data-time">{item.time}</span></div>)}</div> : <div className="data-state">{campusDataLoading ? 'Loading schedule...' : 'Schedule unavailable.'}</div>}
                </section>
                <section className="panel data-panel" id="exam-dates">
                  <div className="data-panel-heading"><span className="panel-icon exams-title-icon"><Clock3 size={17} /></span><div><h3>Exam Dates</h3><p>Upcoming assessment timetable</p></div></div>
                  {campusData.exams ? <div className="data-list">{campusData.exams.exams.map((item) => <div className="data-row exam-row" key={item.course}><span className="exam-date-icon"><CalendarDays size={16} /></span><span className="data-main"><strong>{item.course}</strong><small>{item.date}</small></span><span className="data-time">{item.time}</span></div>)}</div> : <div className="data-state">{campusDataLoading ? 'Loading exam dates...' : 'Exam dates unavailable.'}</div>}
                </section>
              </div>
              <section className="panel data-panel attendance-panel" id="attendance-rules">
                <div className="data-panel-heading"><span className="panel-icon attendance-title-icon"><ShieldCheck size={17} /></span><div><h3>Attendance Rules</h3><p>Know the expectation and where to get help</p></div></div>
                {campusData.attendance ? <div className="attendance-content"><div className="attendance-stat"><strong>{campusData.attendance.minimum_percentage}%</strong><span>sample minimum<br />attendance</span></div><div className="attendance-copy"><p>{campusData.attendance.rule}</p><span>Need support? {campusData.attendance.support_office}</span></div></div> : <div className="data-state">{campusDataLoading ? 'Loading attendance rules...' : 'Attendance information unavailable.'}</div>}
              </section>
              <section className="panel data-panel notices-board" id="college-notices">
                <div className="data-panel-heading notices-board-heading"><span className="panel-icon notice-title-icon"><Bell size={17} /></span><div><h3>College Notices</h3><p>Search announcements and filter by category</p></div><span className="fictional-note"><span /> Sample notices</span></div>
                <form className="notice-search-form" onSubmit={searchNotices}>
                  <label className="notice-search-input"><Search size={16} /><input aria-label="Search college notices" placeholder="Search notices, dates, or audience..." value={noticeSearch} onChange={(event) => setNoticeSearch(event.target.value)} /></label>
                  <select aria-label="Filter notices by category" value={noticeCategory} onChange={changeNoticeCategory}><option value="all">All categories</option><option value="academic">Academic</option><option value="events">Events</option><option value="library">Library</option></select>
                  <button type="submit" disabled={noticeListLoading}><Search size={15} /> Search</button>
                </form>
                {noticeListLoading && <div className="data-state"><span className="button-spinner" /> Loading notices...</div>}
                {noticeListError && <div className="inline-error data-error" role="alert">{noticeListError}</div>}
                {!noticeListLoading && !noticeListError && <div className="notice-results" aria-live="polite">
                  <div className="notice-results-count">{noticeData?.total ?? 0} notice{noticeData?.total === 1 ? '' : 's'} found{noticeData?.fictional ? ' · fictional demo data' : ''}</div>
                  {noticeData?.notices?.length ? noticeData.notices.map((item) => <article className="notice-result-card" key={item.id}><div className="notice-result-top"><span className={`notice-category category-${item.category}`}>{item.category}</span><time>{item.date}</time></div><h4>{item.title}</h4><p>{item.body}</p><span className="notice-audience">For: {item.audience}</span></article>) : <div className="empty-notices">No notices match those filters. Try another search or category.</div>}
                </div>}
              </section>
            </>}
          </section>

          <footer className="page-footer"><span>Made for campus life <span className="footer-heart">♥</span></span><span><span className="demo-disclaimer" />Demo mode uses fictional campus information.</span><a href="#home">Back to top <ArrowUp size={13} /></a></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
