document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
       MOBILE NAVIGATION — reliable tap toggle
    ===================================================== */
  const navRoot = document.querySelector(".nav");
  const menu = navRoot?.querySelector(".menu");
  const links = navRoot?.querySelector(".links");

  if (menu && links && !menu.dataset.mobileNavBound) {
    menu.dataset.mobileNavBound = "true";
    menu.setAttribute("aria-controls", links.id || "main-navigation");
    if (!links.id) links.id = "main-navigation";

    const mobileQuery = window.matchMedia("(max-width: 1100px)");
    const isOpen = () => links.classList.contains("open");

    const setOpen = (open) => {
      links.classList.toggle("open", open);
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      menu.textContent = open ? "×" : "☰";
      document.body.classList.toggle("mobile-nav-open", open && mobileQuery.matches);
    };

    // Native click covers mouse, keyboard, and touch-generated clicks.
    menu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!isOpen());
    });

    links.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (mobileQuery.matches && isOpen() && !navRoot.contains(event.target)) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        setOpen(false);
        menu.focus();
      }
    });

    const resetForViewport = () => {
      if (!mobileQuery.matches) setOpen(false);
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", resetForViewport);
    else mobileQuery.addListener(resetForViewport);
  }

  /* =====================================================
       GALLERY FILTERS
    ===================================================== */

  document.querySelectorAll(".filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((button) => {
        button.classList.remove("active");
      });

      btn.classList.add("active");

      document.querySelectorAll(".gallery-item").forEach((item) => {
        const filter = btn.dataset.filter;
        const group = item.dataset.group || "";

        item.style.display =
          filter === "all" || group.includes(filter) ? "block" : "none";
      });
    });
  });

  /* =====================================================
       GALLERY LIGHTBOX
    ===================================================== */

  const lightbox = document.querySelector(".lightbox");

  const items = [...document.querySelectorAll(".gallery-item")];

  let current = 0;

  function show(n) {
    if (!items.length || !lightbox) {
      return;
    }

    current = (n + items.length) % items.length;

    const visual = lightbox.querySelector(".visual");

    if (visual) {
      visual.textContent = items[current].dataset.label;
    }

    lightbox.classList.add("open");

    lightbox.querySelector(".close")?.focus();
  }

  items.forEach((item, index) => {
    item.addEventListener("click", () => {
      show(index);
    });
  });

  lightbox?.querySelector(".close")?.addEventListener("click", () => {
    lightbox.classList.remove("open");
  });

  lightbox?.querySelector(".prev")?.addEventListener("click", () => {
    show(current - 1);
  });

  lightbox?.querySelector(".next")?.addEventListener("click", () => {
    show(current + 1);
  });

  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      lightbox.classList.remove("open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!lightbox?.classList.contains("open")) {
      return;
    }

    if (event.key === "Escape") {
      lightbox.classList.remove("open");
    }

    if (event.key === "ArrowLeft") {
      show(current - 1);
    }

    if (event.key === "ArrowRight") {
      show(current + 1);
    }
  });

  /* =====================================================
       CONTACT FORM
    ===================================================== */

  const form = document.querySelector("#contact-form");

  // Email-enabled contact forms use the shared delivery handler below.
  if (form && !form.classList.contains("email-enquiry-form"))
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const status = document.querySelector(".form-status");

      if (!form.checkValidity()) {
        form.reportValidity();

        return;
      }

      if (status) {
        status.textContent =
          "Email delivery is not configured yet. Add the secure form endpoint and official email before accepting enquiries.";

        status.style.color = "#8a5b20";
      }
    });
});

/* =====================================================
   EMAIL ENQUIRY FORMS
   Works with Home and future Contact forms
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const enquiryForms = document.querySelectorAll(".email-enquiry-form");

  enquiryForms.forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const recipient = form.dataset.recipient;

      const successMessage =
        form.dataset.successMessage ||
        "Thank you! Your request has been submitted successfully. Our team will contact you within 1 hour.";

      const submitButton = form.querySelector('button[type="submit"]');

      const status = form.querySelector(".form-status");

      if (!recipient) {
        if (status) {
          status.textContent = "The enquiry email is not configured.";

          status.className = "quote-status form-status error";
        }

        return;
      }

      const originalButtonText = submitButton?.textContent;

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "SENDING...";
      }

      if (status) {
        status.textContent = "";
        status.className = "quote-status form-status";
      }

      const formData = new FormData(form);

      const submittedData = Object.fromEntries(formData.entries());

      submittedData._subject =
        form.dataset.subject ||
        submittedData._subject ||
        "New Website Enquiry - Seranova Infra";

      submittedData._template = submittedData._template || "table";

      try {
        const response = await fetch(
          `https://formsubmit.co/ajax/${recipient}`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",

              Accept: "application/json",
            },

            body: JSON.stringify(submittedData),
          },
        );

        const result = await response.json();

        if (
          !response.ok ||
          result.success === false ||
          result.success === "false"
        ) {
          throw new Error(result.message || "Submission failed");
        }

        if (status) {
          status.textContent = successMessage;

          status.className = "quote-status form-status success";
        }

        form.reset();
      } catch (error) {
        if (status) {
          status.textContent =
            "Unable to submit your request. Please try again or call +91 91088 38899.";

          status.className = "quote-status form-status error";
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;

          submitButton.textContent = originalButtonText;
        }
      }
    });
  });
});

/* HOME PAGE: MATERIAL BRAND LOGOS */
document.addEventListener("DOMContentLoaded", () => {
  const showcase = document.querySelector(".intro-panel .brand-showcase");
  if (!showcase) return;

  const heading = showcase.querySelector(".showcase-heading p");
  if (heading) heading.textContent = "MATERIAL BRANDS WE SOURCE";

  // Filenames match the existing brands folder exactly.
  const rows = [
    [
      { file: "tata-steel.jpg", name: "Tata Steel" },
      { file: "jsw-steel.png", name: "JSW Steel" },
      { file: "ultratech.svg", name: "UltraTech Cement" },
      { file: "acc.jpeg", name: "ACC Cement" },
    ],
    [
      { file: "kajaria.jpeg", name: "Kajaria Tiles" },
      { file: "asianpaints.jpeg", name: "Asian Paints" },
      { file: "astral.jpeg", name: "Astral Pipes" },
      { file: "havels.png", name: "Havels" },
    ],
  ];

  showcase.querySelectorAll(".brand-track").forEach((track, rowIndex) => {
    const brands = rows[rowIndex];
    if (!brands) return;

    const group = document.createElement("div");
    group.className = "brand-group";

    // Two sets fill wide panels. A second equal group closes the loop.
    for (let repeat = 0; repeat < 2; repeat += 1) {
      brands.forEach((brand) => {
        const card = document.createElement("div");
        card.className = "material-card brand-card";
        if (repeat > 0) card.setAttribute("aria-hidden", "true");

        const logo = document.createElement("img");
        logo.src = `brands/${brand.file}`;
        logo.alt = repeat === 0 ? brand.name : "";
        logo.width = 66;
        logo.height = 30;
        logo.decoding = "async";

        card.append(logo);
        group.append(card);
      });
    }

    const copy = group.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("img").forEach((logo) => {
      logo.alt = "";
    });
    track.replaceChildren(group, copy);
  });
});

/* GALLERY PAGE: FILTERS AND IMAGE LIGHTBOX */
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("galleryLightbox")) return;

  const filters = document.querySelectorAll(".seranova-gallery-filter");
  const cards = [...document.querySelectorAll(".seranova-gallery-card")];
  const lightbox = document.getElementById("galleryLightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxTitle = document.getElementById("lightboxTitle");

  let currentImage = 0;

  function openLightbox(index) {
    currentImage = index;
    const image = cards[currentImage].querySelector("img");

    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt;
    lightboxTitle.textContent = cards[currentImage].dataset.title;
    lightbox.classList.add("open");
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
  }

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      filters.forEach((button) => button.classList.remove("active"));
      filter.classList.add("active");

      const selectedCategory = filter.dataset.filter;

      cards.forEach((card) => {
        const shouldShow =
          selectedCategory === "all" ||
          card.dataset.category === selectedCategory;

        card.style.display = shouldShow ? "block" : "none";
      });
    });
  });

  cards.forEach((card, index) => {
    card.addEventListener("click", () => openLightbox(index));
  });

  document
    .getElementById("closeLightbox")
    .addEventListener("click", closeLightbox);

  document.getElementById("previousImage").addEventListener("click", () => {
    openLightbox((currentImage - 1 + cards.length) % cards.length);
  });

  document.getElementById("nextImage").addEventListener("click", () => {
    openLightbox((currentImage + 1) % cards.length);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("open")) return;

    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") {
      openLightbox((currentImage - 1 + cards.length) % cards.length);
    }
    if (event.key === "ArrowRight") {
      openLightbox((currentImage + 1) % cards.length);
    }
  });
});
