import { Link } from "react-router-dom";
import { Zap, MessageSquare, Calendar, CheckCircle, Shield, ArrowRight, Clock } from "lucide-react";
import SEO from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const About = () => (
  <>
    <SEO
      title="About Prospectus"
      description="Prospectus is an AI assistant that helps marketing agencies handle inbound leads on WhatsApp and suggest meeting times based on calendar availability."
      canonical="https://prospectus.ia.br/about"
    />
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/about" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Prospectus</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              to="/privacy"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 md:py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Prospectus
          </h1>
          <p className="text-xl md:text-2xl text-primary font-medium mb-6">
            AI agent for lead handling and meeting scheduling for marketing agencies.
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Prospectus is an AI assistant that helps marketing agencies handle inbound leads
            on WhatsApp and suggest meeting times based on calendar availability.
          </p>
        </div>
      </section>

      {/* Google Calendar Data Usage */}
      <section className="py-12 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Google Calendar Data Usage</h2>
          </div>

          <Card className="border-primary/20 bg-card/80">
            <CardContent className="p-6 space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Users can optionally connect their Google Calendar to enable smart scheduling.
                When connected, Prospectus uses calendar data as follows:
              </p>

              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>
                    Requests the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">calendar.readonly</code> scope
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>Uses Google Calendar FreeBusy to check when the user is busy</span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>Suggests available meeting times to leads based on real availability</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span>
                    <strong>Does not</strong> create, edit, or delete events in the user's calendar
                  </span>
                </li>
              </ul>

              <p className="text-muted-foreground leading-relaxed">
                When a meeting is confirmed, the event is created in a system-managed calendar,
                with the user and the lead added as guests.
              </p>

              <p className="text-sm text-muted-foreground">
                For more details, see our{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>

              <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Limited Use Disclosure</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The use of raw or derived user data received from Workspace APIs will adhere to the{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Google User Data Policy
                  </a>
                  , including the Limited Use requirements.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What Prospectus Does */}
      <section className="py-12 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">What Prospectus Does</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">Lead Conversations</h3>
                <p className="text-sm text-muted-foreground">
                  Engages with inbound leads via WhatsApp using AI-powered conversations.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-6 w-6 text-accent" />
                </div>
                <h3 className="font-semibold">Lead Qualification</h3>
                <p className="text-sm text-muted-foreground">
                  Qualifies contacts based on the agency's context, services, and ideal customer profile.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">Meeting Scheduling</h3>
                <p className="text-sm text-muted-foreground">
                  Suggests meeting times based on real calendar availability to avoid conflicts.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How Scheduling Works */}
      <section className="py-12 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">How Scheduling Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Lead asks for a meeting",
                description: "During a WhatsApp conversation, the lead expresses interest in scheduling a call or meeting.",
              },
              {
                step: "2",
                title: "Prospectus checks availability",
                description: "The AI queries Google Calendar FreeBusy to find when the user is free.",
              },
              {
                step: "3",
                title: "Suggests free times",
                description: "Prospectus replies with available time slots so the lead can pick the best option.",
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {item.step !== "3" && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block mt-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Available Integrations */}
      <section className="py-12 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Available Integrations</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">
                    AI-powered conversations with leads. Prospectus sends and receives messages
                    to qualify contacts and handle scheduling.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Google Calendar</h3>
                  <p className="text-sm text-muted-foreground">
                    Read-only availability check. Uses FreeBusy data to suggest meeting times
                    without conflicts.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="edit">
              <AccordionTrigger>Can Prospectus edit my Google Calendar events?</AccordionTrigger>
              <AccordionContent>
                No. Prospectus only requests the <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">calendar.readonly</code> scope
                and cannot create, edit, or delete any events in your calendar.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data">
              <AccordionTrigger>What calendar data does Prospectus access?</AccordionTrigger>
              <AccordionContent>
                Prospectus only accesses free/busy time slots through the Google Calendar FreeBusy API.
                It does not read event titles, descriptions, attendees, or any other event details.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="revoke">
              <AccordionTrigger>How do I revoke Google Calendar access?</AccordionTrigger>
              <AccordionContent>
                You can disconnect Google Calendar at any time from the Integrations section in your
                Prospectus settings, or by removing access in your{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Account permissions
                </a>
                .
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="store">
              <AccordionTrigger>Does Prospectus store my calendar events?</AccordionTrigger>
              <AccordionContent>
                No. Prospectus queries availability in real time and does not store any calendar
                event data.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Gaspar Ads. All rights reserved.</span>
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  </>
);

export default About;
