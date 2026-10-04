import { LegalPageFrame, Block } from './LegalKit';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function Person({ photo, alt, role, name, about, handle, href }) {
  return (
    <div className="lp-person">
      <img src={photo} alt={alt} loading="lazy" />
      <div>
        <div className="lp-role">{role}</div>
        {name && <h3 className="lp-name">{name}</h3>}
        {about && <p className="lp-about">{about}</p>}
        <a className="lp-ig" href={href} target="_blank" rel="noopener noreferrer">
          <InstagramIcon />
          @{handle}
        </a>
      </div>
    </div>
  );
}

export default function AboutUs() {
  return (
    <LegalPageFrame
      current="about"
      eyebrow="Med101"
      title="About Us"
      lead="Learn. Practice. Improve."
    >
      <div className="lp-people">
        <Person
          photo="/about-vijay.jpg"
          alt="Vijay Yadav"
          role="Website manager"
          name="Vijay Yadav"
          about="Currently manages the website."
          handle="vijay.isdope"
          href="https://www.instagram.com/vijay.isdope?stkn=MXFreWFmb2t5bTkzeA=="
        />
        <Person
          photo="/about-babu.jpg"
          alt="OmBabu Gupta"
          role="Supervisor"
          name="OmBabu Gupta"
          about="Supervises the website."
          handle="omgupta_diaries"
          href="https://www.instagram.com/omgupta_diaries"
        />
        <Person
          photo="/about-friend.jpg"
          alt="Aaditya Singh"
          role="Quality assurance"
          name="Aaditya Singh"
          about="Hunts down bugs on the site so you don't have to."
          handle="walker101z"
          href="https://www.instagram.com/walker101z"
        />
      </div>

      <Block title="Our Journey">
        <p className="lp-quote">
          It all started with a simple thought: <strong>why not create a
          system where we can all practice the questions we have learned?</strong>
        </p>
        <p style={{ marginTop: 14 }}>
          Med101 was created with the aim of giving you a simple place to{' '}
          <strong>practice MCQs, revise important concepts, and test your
          knowledge regularly.</strong>
        </p>
      </Block>

      <Block title="Our Aim &amp; Mission">
        <p>
          Our aim and mission are simple: <strong>to help you learn, practice,
          and improve.</strong>
        </p>
        <p>
          We believe that <strong>consistent practice can make a real
          difference in all of us.</strong>
        </p>
      </Block>

      <Block title="We Are Human. We Make Mistakes.">
        <p>
          We're not superhuman, and <strong>we make mistakes too.</strong>
        </p>
        <p>
          Although we try our best to keep the information on Med101 accurate,
          errors can sometimes happen.
        </p>
        <p>
          If you find a mistake, incorrect answer, outdated information, or
          anything that needs correction, <strong>please let us know.</strong>
        </p>
        <p>Your feedback helps us make Med101 better for everyone.</p>
      </Block>

      <Block title="Have Any Questions?">
        <p>
          Have a question, suggestion, or found something that needs our
          attention? <strong>Don't hesitate to reach out.</strong>
        </p>
        <p>
          We're always happy to hear from you and improve Med101 together with
          the community.
        </p>
        <div className="lp-actions">
          <a className="lp-btn" href="/contact">Contact us</a>
        </div>
      </Block>
    </LegalPageFrame>
  );
}
