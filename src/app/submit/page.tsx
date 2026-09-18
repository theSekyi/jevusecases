"use client";

import { useState, type FormEvent } from "react";
import {
  CATEGORIES,
  validateSubmission,
  type SubmissionFieldErrors,
  type SubmissionInput,
} from "@/lib/submission";
import { Field, fieldProps, inputClass, primaryButtonClass } from "@/components/FormField";

type FieldValues = Record<keyof SubmissionInput, string>;

const EMPTY_VALUES: FieldValues = {
  name: "",
  description: "",
  category: "",
  sourceLink: "",
  xHandle: "",
};

type Status = "idle" | "submitting" | "success";

export default function SubmitPage() {
  const [values, setValues] = useState<FieldValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<SubmissionFieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);

  function setField(field: keyof FieldValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setFieldErrors({});
    setFormError(null);

    const result = validateSubmission(values);
    if (!result.success) {
      setFieldErrors(result.errors);
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (response.ok) {
        setStatus("success");
        setValues(EMPTY_VALUES);
        return;
      }

      if (response.status === 429) {
        setFormError("You've hit the submission limit. Try again in a bit.");
        setStatus("idle");
        return;
      }

      if (response.status === 400) {
        const data = (await response.json()) as { fieldErrors?: SubmissionFieldErrors };
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
          setStatus("idle");
          return;
        }
      }

      setFormError("Something went wrong submitting your project. Try again.");
      setStatus("idle");
    } catch (error) {
      console.error("Failed to submit project:", error);
      setFormError("Something went wrong submitting your project. Try again.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <main className="flex flex-1 items-center justify-center bg-bp-bg px-6 py-24 font-bp-sans text-bp-ink">
        <div className="max-w-md text-center">
          <p className="font-bp-mono text-[11px] tracking-widest text-bp-accent">SUBMITTED</p>
          <h1 className="mt-3 text-2xl font-bold">Thanks — it&apos;s in the queue.</h1>
          <p className="mt-3 text-sm text-bp-secondary">
            We review every submission by hand. If it checks out, it shows up here once merged.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">SUBMIT A PROJECT</span>
          <h1 className="text-3xl font-bold">Tell us what you built with Jev.</h1>
          <p className="text-sm text-bp-secondary">
            Every submission is reviewed by hand before it appears on the site.
          </p>
        </div>

        <Field label="PROJECT NAME" htmlFor="name" error={fieldErrors.name}>
          <input
            {...fieldProps("name", fieldErrors.name)}
            type="text"
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. jev-guard"
            className={inputClass}
          />
        </Field>

        <Field label="DESCRIPTION" htmlFor="description" error={fieldErrors.description}>
          <textarea
            {...fieldProps("description", fieldErrors.description)}
            rows={3}
            value={values.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="What does it do, and how does it use Jev?"
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="CATEGORY" htmlFor="category" error={fieldErrors.category}>
          <select
            {...fieldProps("category", fieldErrors.category)}
            value={values.category}
            onChange={(e) => setField("category", e.target.value)}
            className={inputClass}
          >
            <option value="">Choose a category</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="SOURCE LINK"
          htmlFor="sourceLink"
          error={fieldErrors.sourceLink}
          hint="github.com or npmjs.com links only"
        >
          <input
            {...fieldProps("sourceLink", fieldErrors.sourceLink)}
            type="text"
            value={values.sourceLink}
            onChange={(e) => setField("sourceLink", e.target.value)}
            placeholder="https://github.com/you/your-project"
            className={inputClass}
          />
        </Field>

        <Field label="X HANDLE (OPTIONAL)" htmlFor="xHandle" error={fieldErrors.xHandle}>
          <input
            {...fieldProps("xHandle", fieldErrors.xHandle)}
            type="text"
            value={values.xHandle}
            onChange={(e) => setField("xHandle", e.target.value)}
            placeholder="@you"
            className={inputClass}
          />
        </Field>

        {formError && (
          <p role="alert" className="text-sm text-bp-accent">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className={primaryButtonClass}
        >
          {status === "submitting" ? "Submitting…" : "Submit"}
        </button>
      </form>
    </main>
  );
}
