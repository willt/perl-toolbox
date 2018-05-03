"use strict";

import * as cp from "child_process";
import * as vscode from "vscode";

export default class PerlLintProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private command: vscode.Disposable;
  private configuration: vscode.WorkSpace.Configuration;
  private document: vscode.TextDocument;

  public activate(subscriptions: vscode.Disposable[]) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
    vscode.workspace.onDidCloseTextDocument(
      textDocument => {
        this.diagnosticCollection.delete(textDocument.uri);
      },
      null,
      subscriptions
    );

    vscode.workspace.onDidOpenTextDocument(this.lint, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.lint, this);
  }

  public dispose(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
    this.command.dispose();
  }

  private lint(textDocument: vscode.TextDocument) {
    this.document = textDocument;
    this.configuration = vscode.workspace.getConfiguration("perl-toolbox.lint");
    console.log(this.configuration);
    if (textDocument.languageId !== "perl") {
      return;
    }
    if (!this.configuration.enabled) {
      return;
    }
    let decoded = "";

    let proc = cp.spawn(
      "perlcritic",
      this.getCommandArguments(),
      this.getCommandOptions()
    );
    proc.stdout.on("data", (data: Buffer) => {
      decoded += data;
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.log(`stderr: ${data}`);
    });

    proc.stdout.on("end", () => {
      this.diagnosticCollection.set(
        this.document.uri,
        this.getDiagnostics(decoded)
      );
    });
  }

  private getDiagnostics(output) {
    let diagnostics: vscode.Diagnostic[] = [];
    output.split("\n").forEach(violation => {
      if (this.isValidViolation(violation)) {
        diagnostics.push(this.createDiagnostic(violation));
      }
    });
    return diagnostics;
  }

  private createDiagnostic(violation) {
    let tokens = violation.replace("~||~", "").split("~|~");

    return new vscode.Diagnostic(
      this.getRange(tokens),
      this.getMessage(tokens),
      this.getSeverity(tokens)
    );
  }

  private getRange(tokens) {
    return new vscode.Range(
      Number(tokens[1]) - 1,
      Number(tokens[2]) - 1,
      Number(tokens[1]) - 1,
      300
    );
  }

  private getMessage(tokens) {
    return this.getSeverityAsText(tokens[0]).toUpperCase() + ": " + tokens[3];
  }

  private getSeverityAsText(severity) {
    switch (parseInt(severity)) {
      case 5:
        return "gentle";
      case 4:
        return "stern";
      case 3:
        return "harsh";
      case 2:
        return "cruel";
      default:
        return "brutal";
    }
  }

  private getSeverity(tokens) {
    switch (this.configuration[this.getSeverityAsText(tokens[0])]) {
      case "hint":
        return vscode.DiagnosticSeverity.Hint;
      case "info":
        return vscode.DiagnosticSeverity.Information;
      case "warning":
        return vscode.DiagnosticSeverity.Warning;
      default:
        return vscode.DiagnosticSeverity.Error;
    }
  }

  private isValidViolation(violation) {
    return violation.split("~|~").length === 6;
  }

  private getCommandOptions() {
    return {
      shell: true,
      cwd: this.getWorkingDirectory()
    };
  }

  private getCommandArguments() {
    return [
      "--" + this.getLintSeverity(),
      this.useProfile(),
      this.getExcludedPolicies(),
      "--verbose",
      '"%s~|~%l~|~%c~|~%m~|~%e~|~%p~||~%n"',
      this.document.fileName
    ];
  }

  private getExcludedPolicies() {
    let policies = [];
    this.configuration.excludedPolicies.forEach(policy => {
      policies.push("--exclude");
      policies.push(policy);
    });
    return policies.join(" ");
  }

  private getWorkingDirectory() {
    return this.configuration.path;
  }

  private useProfile() {
    if (!this.configuration.useProfile) {
      return "--noprofile";
    }
  }
  private getLintSeverity() {
    return this.configuration.severity;
  }
}