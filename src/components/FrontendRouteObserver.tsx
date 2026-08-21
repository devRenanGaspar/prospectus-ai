import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { recordFrontendRoute } from "@/lib/observability";

const FrontendRouteObserver = () => {
  const location = useLocation();
  const initialNavigation = useRef(true);

  useEffect(() => {
    recordFrontendRoute(
      location.pathname,
      initialNavigation.current ? "navigate" : "soft-navigation",
    );
    initialNavigation.current = false;
  }, [location.pathname]);

  return null;
};

export default FrontendRouteObserver;
