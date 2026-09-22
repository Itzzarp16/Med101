import './LegalPage.css';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
export default function AboutUs() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>About Us</h1>

        <p>
          This website is currently managed by <strong>Vijay Yadav</strong>.
        </p>

        <div style={{ margin: '20px 0', textAlign: 'center' }}>
          <img
            src="/about-vijay.jpg"
            alt="Vijay Yadav"
            style={{ maxWidth: 240, width: '100%', borderRadius: 16 }}
          />
        </div>

        <p>
          Instagram:{' '}
          <a
            href="https://www.instagram.com/vijay.isdope?stkn=MXFreWFmb2t5bTkzeA=="
            target="_blank"
            rel="noopener noreferrer"
          >
            @vijay.isdope
          </a>
        </p>

        <p>
          The website is supervised by <strong>Babu Gupta</strong>.
        </p>

        <div style={{ margin: '20px 0', textAlign: 'center' }}>
          <img
            src="/about-babu.jpg"
            alt="Babu Gupta"
            style={{ maxWidth: 240, width: '100%', borderRadius: 16 }}
          />
        </div>

        <p>
          Instagram:{' '}
          <a
            href="https://www.instagram.com/omgupta_diaries"
            target="_blank"
            rel="noopener noreferrer"
          >
            @omgupta_diaries
          </a>
        </p>

        <div style={{ margin: '24px 0', textAlign: 'center' }}>
          <img
            src="/about-friend.jpg"
            alt="Site co-owner"
            style={{ maxWidth: 280, width: '100%', borderRadius: 16 }}
          />
          <p style={{ marginTop: 10, fontStyle: 'italic' }}>
            This person paid ₹21 to have his photo put up here.
            {' '}Instagram:{' '}
            <a
              href="https://www.instagram.com/walker101z"
              target="_blank"
              rel="noopener noreferrer"
            >
              @walker101z
            </a>
          </p>
        </div>

        <h2>Our Journey</h2>
        <p>
          It all started with a simple thought: <strong>why not create a
          system where we can all practice the questions we have learned?</strong>
        </p>

        <p>
          Med101 was created with the aim of giving you a simple place to{' '}
          <strong>practice MCQs, revise important concepts, and test your
          knowledge regularly.</strong>
        </p>

        <h2>Our Aim &amp; Mission</h2>
        <p>
          Our aim and mission are simple: <strong>to help you learn, practice,
          and improve.</strong>
        </p>

        <p>
          We believe that <strong>consistent practice can make a real
          difference in all of us.</strong>
        </p>

        <h2>We Are Human. We Make Mistakes.</h2>
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

        <p>
          Your feedback helps us make Med101 better for everyone.
        </p>

        <h2>Have Any Questions?</h2>
        <p>
          Have a question, suggestion, or found something that needs our
          attention?
        </p>

        <p>
          <strong>Don't hesitate to reach out.</strong>
        </p>

        <p>
          We're always happy to hear from you and improve Med101 together with
          the community.
        </p>

        <p>
          <strong>Med101 | Learn. Practice. Improve.</strong>
        </p>
      </div>
    </div>
  );
}
