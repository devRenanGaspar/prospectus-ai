import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

const SEO = ({ title, description, canonical, ogImage }: SEOProps) => (
  <Helmet>
    <title>{title} | Prospectus</title>
    {description && <meta name="description" content={description} />}
    {canonical && <link rel="canonical" href={canonical} />}
    <meta property="og:title" content={`${title} | Prospectus`} />
    {description && <meta property="og:description" content={description} />}
    {ogImage && <meta property="og:image" content={ogImage} />}
  </Helmet>
);

export default SEO;
