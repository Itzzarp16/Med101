import './LegalPage.css';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
export default function ContactUs() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Contact Us</h1>

        <p>
          Have a question, suggestion, or found something that needs our
          attention?
        </p>

        <p>
          <strong>Don't hesitate to reach out.</strong>
        </p>

        <h2>Get in Touch</h2>

        <p>
          For questions, feedback, corrections, or support, you can contact
          us at:
        </p>

        <p>
          <a href="mailto:admin.med101@gmail.com">
            admin.med101@gmail.com
          </a>
        </p>

        <p>
          We are always happy to hear from you and work together to make
          Med101 better for everyone.
        </p>

        <p>
          <strong>Med101 | Learn. Practice. Improve.</strong>
        </p>
      </div>
    </div>
  );
}
